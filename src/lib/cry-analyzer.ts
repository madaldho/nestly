import type { CryCause } from '@/types'

export type CrySoundKey =
  | 'neh'
  | 'owh'
  | 'heh'
  | 'eairh'
  | 'eh'
  | 'belly_pain'
  | 'burping'
  | 'cold_hot'
  | 'discomfort'
  | 'hungry'
  | 'lonely'
  | 'scared'
  | 'tired'

export interface CryPrediction {
  sound: string
  cause: CryCause
  label: string
  confidence: number
  tip: string
}

export interface CryAnalysisResult {
  ok: boolean
  reason?: 'too_short' | 'too_quiet' | 'decode_failed'
  durationSec: number
  rms: number
  predictions: CryPrediction[]
  top: CryPrediction | null
  features: AcousticFeatures
}

export interface AcousticFeatures {
  durationSec: number
  rms: number
  peakHz: number
  meanHz: number
  pitchStability: number
  burstCount: number
  burstRate: number
  meanBurstMs: number
  dutyCycle: number
  spectralCentroid: number
  energySlope: number
}

const LABELS: Record<
  CrySoundKey,
  { cause: CryCause; label: string; tip: string }
> = {
  neh: {
    cause: 'hungry',
    label: 'Lapar (Neh)',
    tip: 'Coba tawarkan ASI/susu. Tanda awal: tangan ke mulut, rooting.',
  },
  owh: {
    cause: 'sleepy',
    label: 'Ngantuk (Owh)',
    tip: 'Redupkan lampu, kurangi stimulasi, goyang perlahan atau white noise.',
  },
  heh: {
    cause: 'diaper',
    label: 'Tidak nyaman (Heh)',
    tip: 'Cek popok, suhu, dan pakaian — bisa basah, panas, atau label mengganggu.',
  },
  eairh: {
    cause: 'gas',
    label: 'Sakit perut / gas (Eairh)',
    tip: 'Gerakan sepeda kaki, pijat perut searah jarum jam, atau gendong tegak.',
  },
  eh: {
    cause: 'gas',
    label: 'Perlu sendawa (Eh)',
    tip: 'Tepuk punggung perlahan di atas bahu, gendong tegak 10–15 menit.',
  },
}

/** Decode recorded blob → mono float32 PCM */
export async function decodeAudioBlob(blob: Blob): Promise<{
  samples: Float32Array
  sampleRate: number
}> {
  const ctx = new AudioContext()
  try {
    const buf = await blob.arrayBuffer()
    const audio = await ctx.decodeAudioData(buf.slice(0))
    const ch0 = audio.getChannelData(0)
    // mixdown if stereo
    if (audio.numberOfChannels > 1) {
      const ch1 = audio.getChannelData(1)
      const mixed = new Float32Array(ch0.length)
      for (let i = 0; i < ch0.length; i++) mixed[i] = (ch0[i] + ch1[i]) * 0.5
      return { samples: mixed, sampleRate: audio.sampleRate }
    }
    return { samples: new Float32Array(ch0), sampleRate: audio.sampleRate }
  } finally {
    await ctx.close()
  }
}

function rmsOf(samples: Float32Array) {
  let s = 0
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i]
  return Math.sqrt(s / Math.max(1, samples.length))
}

/** Autocorrelation pitch estimate on a short frame (Hz) */
function estimatePitch(frame: Float32Array, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / 900) // max ~900 Hz (baby cries are high)
  const maxLag = Math.floor(sampleRate / 200) // min ~200 Hz
  if (frame.length < maxLag * 2) return 0

  let bestLag = 0
  let bestCorr = 0
  let energy = 0
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i]
  if (energy < 1e-6) return 0

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    const n = frame.length - lag
    for (let i = 0; i < n; i++) corr += frame[i] * frame[i + lag]
    corr /= energy
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }

  if (bestCorr < 0.25 || bestLag === 0) return 0
  return sampleRate / bestLag
}

/** Fast spectral brightness proxy via high-pass energy ratio → Hz-ish scale */
function spectralCentroidOf(frame: Float32Array, sampleRate: number): number {
  if (frame.length < 8) return 0
  let total = 0
  let high = 0
  // one-pole high-pass ~1.5 kHz-ish relative energy
  const rc = 1 / (2 * Math.PI * 1500)
  const dt = 1 / sampleRate
  const alpha = rc / (rc + dt)
  let prevX = frame[0]
  let prevY = 0
  for (let i = 0; i < frame.length; i++) {
    const x = frame[i]
    const y = alpha * (prevY + x - prevX)
    prevX = x
    prevY = y
    const e = x * x
    total += e
    high += y * y
  }
  if (total < 1e-10) return 0
  // map ratio 0..1 → ~200..4000 Hz for classifier heuristics
  return 200 + (high / total) * 3800
}

export function extractFeatures(
  samples: Float32Array,
  sampleRate: number,
): AcousticFeatures {
  const durationSec = samples.length / sampleRate
  const rms = rmsOf(samples)

  // frame-wise analysis
  const frameSize = Math.floor(sampleRate * 0.04) // 40ms
  const hop = Math.floor(sampleRate * 0.02) // 20ms
  const pitches: number[] = []
  const energies: number[] = []
  const centroids: number[] = []

  for (let start = 0, fi = 0; start + frameSize < samples.length; start += hop, fi++) {
    const frame = samples.subarray(start, start + frameSize)
    const e = rmsOf(frame)
    energies.push(e)
    if (e > rms * 0.35) {
      // pitch every other active-ish frame for speed
      if (fi % 2 === 0) {
        const p = estimatePitch(frame, sampleRate)
        if (p > 0) pitches.push(p)
      }
      const c = spectralCentroidOf(frame, sampleRate)
      if (c > 0) centroids.push(c)
    }
  }

  // burst detection from energy envelope
  const thresh = Math.max(rms * 0.45, 0.01)
  const active: boolean[] = energies.map((e) => e >= thresh)
  const bursts: number[] = []
  let inBurst = false
  let burstStart = 0
  for (let i = 0; i < active.length; i++) {
    if (active[i] && !inBurst) {
      inBurst = true
      burstStart = i
    } else if (!active[i] && inBurst) {
      inBurst = false
      bursts.push((i - burstStart) * hop)
    }
  }
  if (inBurst) bursts.push((active.length - burstStart) * hop)

  const burstCount = bursts.length
  const meanBurstMs =
    burstCount > 0
      ? (bursts.reduce((a, b) => a + b, 0) / burstCount / sampleRate) * 1000
      : 0
  const burstRate = durationSec > 0 ? burstCount / durationSec : 0
  const dutyCycle =
    energies.length > 0 ? active.filter(Boolean).length / energies.length : 0

  const meanHz =
    pitches.length > 0 ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 0
  const peakHz = pitches.length > 0 ? Math.max(...pitches) : 0

  // stability = 1 - coeff of variation
  let pitchStability = 0
  if (pitches.length > 2) {
    const mean = meanHz
    const variance =
      pitches.reduce((s, p) => s + (p - mean) ** 2, 0) / pitches.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1
    pitchStability = Math.max(0, Math.min(1, 1 - cv))
  }

  const spectralCentroid =
    centroids.length > 0
      ? centroids.reduce((a, b) => a + b, 0) / centroids.length
      : 0

  // energy slope: early vs late half
  const mid = Math.floor(energies.length / 2)
  const early =
    mid > 0 ? energies.slice(0, mid).reduce((a, b) => a + b, 0) / mid : 0
  const late =
    energies.length - mid > 0
      ? energies.slice(mid).reduce((a, b) => a + b, 0) / (energies.length - mid)
      : 0
  const energySlope = early > 0 ? (late - early) / early : 0

  return {
    durationSec,
    rms,
    peakHz,
    meanHz,
    pitchStability,
    burstCount,
    burstRate,
    meanBurstMs,
    dutyCycle,
    spectralCentroid,
    energySlope,
  }
}

/**
 * Heuristic classifier inspired by Dunstan Baby Language + Donate-a-Cry
 * acoustic traits. Runs fully on-device — no upload.
 *
 * Neh (hungry): rhythmic, rising intensity, mid-high pitch
 * Owh (sleepy): long continuous, falling/monotone, lower energy
 * Heh (discomfort): short choppy bursts, lower intensity
 * Eairh (belly pain): strained, lower pitch, irregular long bursts
 * Eh (burp): very short rapid bursts ("eh-eh-eh")
 */
function scoreClasses(f: AcousticFeatures): Record<CrySoundKey, number> {
  const scores: Record<CrySoundKey, number> = {
    neh: 0.15,
    owh: 0.15,
    heh: 0.15,
    eairh: 0.15,
    eh: 0.15,
  }

  // Eh — short rapid bursts
  if (f.meanBurstMs > 0 && f.meanBurstMs < 280 && f.burstRate >= 1.8) {
    scores.eh += 0.45
  }
  if (f.burstRate >= 2.5 && f.meanBurstMs < 200) scores.eh += 0.2
  if (f.burstCount >= 4 && f.durationSec < 6) scores.eh += 0.1

  // Heh — short choppy, moderate rate, not too loud
  if (f.meanBurstMs > 80 && f.meanBurstMs < 450 && f.burstRate >= 0.8 && f.burstRate < 2.2) {
    scores.heh += 0.35
  }
  if (f.rms < 0.08 && f.dutyCycle < 0.55) scores.heh += 0.15
  if (f.pitchStability < 0.55) scores.heh += 0.1

  // Owh — long continuous, stable/falling, lower centroid
  if (f.meanBurstMs > 700 || (f.dutyCycle > 0.65 && f.burstCount <= 3)) {
    scores.owh += 0.4
  }
  if (f.energySlope < -0.05) scores.owh += 0.2
  if (f.pitchStability > 0.55) scores.owh += 0.15
  if (f.spectralCentroid > 0 && f.spectralCentroid < 1200) scores.owh += 0.1

  // Eairh — strained, lower pitch, irregular longer bursts
  if (f.meanHz > 0 && f.meanHz < 380) scores.eairh += 0.3
  if (f.meanBurstMs > 400 && f.meanBurstMs < 1200 && f.burstRate < 1.5) {
    scores.eairh += 0.25
  }
  if (f.pitchStability < 0.4 && f.rms > 0.06) scores.eairh += 0.2
  if (f.dutyCycle > 0.35 && f.dutyCycle < 0.7) scores.eairh += 0.1

  // Neh — rhythmic mid bursts, rising energy, higher pitch
  if (f.meanBurstMs > 250 && f.meanBurstMs < 700 && f.burstRate >= 0.6 && f.burstRate <= 2.0) {
    scores.neh += 0.35
  }
  if (f.energySlope > 0.08) scores.neh += 0.25
  if (f.meanHz >= 350 && f.meanHz <= 650) scores.neh += 0.2
  if (f.pitchStability > 0.35 && f.pitchStability < 0.75) scores.neh += 0.1

  return scores
}

function normalizePredictions(
  scores: Record<CrySoundKey, number>,
): CryPrediction[] {
  const entries = Object.entries(scores) as [CrySoundKey, number][]
  const total = entries.reduce((s, [, v]) => s + Math.max(0, v), 0) || 1
  return entries
    .map(([sound, raw]) => {
      const meta = LABELS[sound]
      return {
        sound,
        cause: meta.cause,
        label: meta.label,
        confidence: Math.round((Math.max(0, raw) / total) * 100),
        tip: meta.tip,
      }
    })
    .sort((a, b) => b.confidence - a.confidence)
}

export async function analyzeCryBlob(blob: Blob): Promise<CryAnalysisResult> {
  let samples: Float32Array
  let sampleRate: number
  try {
    ;({ samples, sampleRate } = await decodeAudioBlob(blob))
  } catch {
    return {
      ok: false,
      reason: 'decode_failed',
      durationSec: 0,
      rms: 0,
      predictions: [],
      top: null,
      features: emptyFeatures(),
    }
  }

  const features = extractFeatures(samples, sampleRate)

  if (features.durationSec < 1.2) {
    return {
      ok: false,
      reason: 'too_short',
      durationSec: features.durationSec,
      rms: features.rms,
      predictions: [],
      top: null,
      features,
    }
  }

  if (features.rms < 0.008) {
    return {
      ok: false,
      reason: 'too_quiet',
      durationSec: features.durationSec,
      rms: features.rms,
      predictions: [],
      top: null,
      features,
    }
  }

  const predictions = normalizePredictions(scoreClasses(features))
  return {
    ok: true,
    durationSec: features.durationSec,
    rms: features.rms,
    predictions,
    top: predictions[0] ?? null,
    features,
  }
}

function emptyFeatures(): AcousticFeatures {
  return {
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
  }
}
