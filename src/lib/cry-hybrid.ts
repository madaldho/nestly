/**
 * Hybrid cry reasoner:
 * 1) ONNX ResNet18 from blessingoraz/baby-cry-classifier (real trained weights)
 * 2) Acoustic heuristics (Dunstan-style)
 * 3) Nestly activity context (last feed / sleep / diaper)
 *
 * Why hybrid: the open ONNX model alone is trained on a tiny imbalanced set
 * (~512 clips, hungry-heavy) and often misfires on its own sample files.
 * Context from the baby's recent log is the strongest signal parents already have.
 */

import { differenceInMinutes, parseISO } from 'date-fns'
import type { BabyEvent, CryCause } from '@/types'
import {
  analyzeCryBlob,
  type CryAnalysisResult,
  type CryPrediction,
} from '@/lib/cry-analyzer'
import { classifyCryWithMl, loadCryModel } from '@/lib/cry-ml'
import { activeEvents, lastFeed } from '@/lib/insights'

const TIPS: Record<CryCause, string> = {
  hungry: 'Tawarkan ASI/susu. Perhatikan rooting dan tangan ke mulut.',
  sleepy: 'Redupkan lampu, kurangi stimulasi, goyang perlahan atau white noise.',
  diaper: 'Cek popok, suhu, dan pakaian — bisa basah atau tidak nyaman.',
  gas: 'Gerakan sepeda kaki, pijat perut, atau bantu sendawa.',
  overstim: 'Kurangi stimulasi, peluk erat, bicara pelan di ruang tenang.',
  unknown: 'Coba checklist: susu, popok, sendawa, tidur, lalu peluk.',
}

const LABELS: Record<CryCause, string> = {
  hungry: 'Lapar',
  sleepy: 'Ngantuk / lelah',
  diaper: 'Tidak nyaman / popok',
  gas: 'Gas / sakit perut',
  overstim: 'Overstim / butuh perhatian',
  unknown: 'Belum jelas',
}

function emptyScores(): Record<CryCause, number> {
  return {
    hungry: 0,
    sleepy: 0,
    diaper: 0,
    gas: 0,
    overstim: 0,
    unknown: 0.05,
  }
}

function contextScores(events: BabyEvent[]): {
  scores: Record<CryCause, number>
  notes: string[]
} {
  const scores = emptyScores()
  const notes: string[] = []
  const live = activeEvents(events)
  const now = new Date()

  const feed = lastFeed(live)
  if (feed) {
    const mins = differenceInMinutes(now, parseISO(feed.timestamp))
    if (mins >= 180) {
      scores.hungry += 0.45
      notes.push(`Susu terakhir ${mins} mnt lalu — kemungkinan lapar tinggi`)
    } else if (mins >= 120) {
      scores.hungry += 0.28
      notes.push(`Susu terakhir ${mins} mnt lalu`)
    } else if (mins <= 25) {
      scores.gas += 0.22
      notes.push('Baru selesai susu — cek sendawa / gas')
    }
  } else {
    scores.hungry += 0.18
    notes.push('Belum ada catatan susu')
  }

  const diaper = live
    .filter((e) => e.type === 'diaper')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
  if (diaper) {
    const mins = differenceInMinutes(now, parseISO(diaper.timestamp))
    if (mins >= 120) {
      scores.diaper += 0.3
      notes.push(`Popok terakhir ${mins} mnt lalu`)
    }
  } else {
    scores.diaper += 0.12
  }

  const sleep = live
    .filter((e) => e.type === 'sleep')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
  if (sleep) {
    if (!sleep.sleepEnd) {
      // currently sleeping but crying? unusual — discomfort/gas
      scores.diaper += 0.1
      scores.gas += 0.1
    } else {
      const awake = differenceInMinutes(now, parseISO(sleep.sleepEnd))
      if (awake >= 90) {
        scores.sleepy += 0.35
        notes.push(`Sudah bangun ~${awake} mnt — bisa lelah`)
      } else if (awake >= 60) {
        scores.sleepy += 0.2
      }
    }
  }

  return { scores, notes }
}

function addPredictionScores(
  target: Record<CryCause, number>,
  preds: CryPrediction[],
  weight: number,
) {
  const total = preds.reduce((s, p) => s + Math.max(0, p.confidence), 0) || 1
  for (const p of preds) {
    target[p.cause] += weight * (p.confidence / total)
  }
}

function toPredictions(scores: Record<CryCause, number>): CryPrediction[] {
  const entries = Object.entries(scores) as [CryCause, number][]
  const sum = entries.reduce((s, [, v]) => s + Math.max(0, v), 0) || 1
  return entries
    .map(([cause, raw]) => ({
      sound: cause,
      cause,
      label: LABELS[cause],
      confidence: Math.round((Math.max(0, raw) / sum) * 100),
      tip: TIPS[cause],
    }))
    .filter((p) => p.cause !== 'unknown' || p.confidence >= 8)
    .sort((a, b) => b.confidence - a.confidence)
}

export type HybridCryResult = CryAnalysisResult & {
  engine: 'hybrid'
  source: string
  contextNotes: string[]
  usedMl: boolean
}

export async function analyzeCryHybrid(
  blob: Blob,
  events: BabyEvent[],
): Promise<HybridCryResult> {
  const scores = emptyScores()
  const { scores: ctx, notes } = contextScores(events)
  for (const k of Object.keys(ctx) as CryCause[]) scores[k] += ctx[k] * 1.15

  let usedMl = false
  let durationSec = 0
  let rms = 0
  let features = (
    await analyzeCryBlob(blob).catch(() => null)
  )?.features

  // Acoustic heuristic always available as soft prior
  try {
    const heuristic = await analyzeCryBlob(blob)
    durationSec = heuristic.durationSec
    rms = heuristic.rms
    features = heuristic.features
    if (!heuristic.ok) {
      return {
        ok: false,
        reason: heuristic.reason,
        durationSec,
        rms,
        predictions: [],
        top: null,
        features: heuristic.features,
        engine: 'hybrid',
        source: 'Nestly hybrid',
        contextNotes: notes,
        usedMl: false,
      }
    }
    addPredictionScores(scores, heuristic.predictions, 0.55)
  } catch {
    /* ignore */
  }

  try {
    await loadCryModel()
    const ml = await classifyCryWithMl(blob)
    durationSec = ml.durationSec || durationSec
    rms = ml.rms || rms
    features = ml.features || features
    if (ml.ok) {
      usedMl = true
      // Cap ML weight — model is real but dataset-limited
      addPredictionScores(scores, ml.predictions, 0.7)
    }
  } catch (err) {
    console.warn('ML unavailable', err)
  }

  if (!features) {
    return {
      ok: false,
      reason: 'decode_failed',
      durationSec: 0,
      rms: 0,
      predictions: [],
      top: null,
      features: {
        durationSec: 0,
        rms: 0,
        peakHz: 0,
        meanHz: 0,
        pitchStability: 0,
        burstCount: 0,
        burstRate: 0,
        meanBurstMs: 0,
        dutyCycle: 0,
        spectralCentroid: 0,
        energySlope: 0,
      },
      engine: 'hybrid',
      source: 'Nestly hybrid',
      contextNotes: notes,
      usedMl: false,
    }
  }

  const predictions = toPredictions(scores)
  return {
    ok: true,
    durationSec,
    rms,
    predictions,
    top: predictions[0] ?? null,
    features,
    engine: 'hybrid',
    source: usedMl
      ? 'Model ML (baby-cry-classifier) + heuristik + konteks Nestly'
      : 'Heuristik + konteks Nestly',
    contextNotes: notes,
    usedMl,
  }
}
