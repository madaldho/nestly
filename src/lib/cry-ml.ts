/**
 * Mel-spectrogram + ONNX ResNet18 inference
 * Port of blessingoraz/baby-cry-classifier (MIT) Lambda DSP pipeline.
 * Model: https://github.com/blessingoraz/baby-cry-classifier/releases/tag/v1.0.0
 */

import * as ort from 'onnxruntime-web'
import type { CryCause } from '@/types'
import type { CryAnalysisResult, CryPrediction } from '@/lib/cry-analyzer'
import { decodeAudioBlob, extractFeatures } from '@/lib/cry-analyzer'

export const ML_CLASSES = [
  'belly_pain',
  'burping',
  'cold_hot',
  'discomfort',
  'hungry',
  'lonely',
  'scared',
  'tired',
] as const

export type MlCryClass = (typeof ML_CLASSES)[number]

const TARGET_SR = 8000
const CLIP_SECONDS = 7
const FIXED_LEN = TARGET_SR * CLIP_SECONDS
const N_MELS = 128
const N_FFT = 1024
const HOP_LENGTH = 256
const OUT = 224

const CLASS_META: Record<
  MlCryClass,
  { cause: CryCause; label: string; tip: string }
> = {
  belly_pain: {
    cause: 'gas',
    label: 'Sakit perut',
    tip: 'Coba gerakan sepeda kaki, pijat perut searah jarum jam, atau gendong tegak.',
  },
  burping: {
    cause: 'gas',
    label: 'Perlu sendawa',
    tip: 'Tepuk punggung perlahan di atas bahu, gendong tegak 10–15 menit.',
  },
  cold_hot: {
    cause: 'diaper',
    label: 'Kedinginan / kepanasan',
    tip: 'Cek suhu ruangan dan lapisan pakaian — sesuaikan sampai nyaman.',
  },
  discomfort: {
    cause: 'diaper',
    label: 'Tidak nyaman',
    tip: 'Cek popok, label baju, dan posisi gendong.',
  },
  hungry: {
    cause: 'hungry',
    label: 'Lapar',
    tip: 'Tawarkan ASI/susu. Perhatikan rooting dan tangan ke mulut.',
  },
  lonely: {
    cause: 'overstim',
    label: 'Butuh perhatian',
    tip: 'Gendong, kontak kulit, atau suara lembut orang tua.',
  },
  scared: {
    cause: 'overstim',
    label: 'Kaget / takut',
    tip: 'Kurangi stimulasi, peluk erat, bicara pelan.',
  },
  tired: {
    cause: 'sleepy',
    label: 'Lelah / ngantuk',
    tip: 'Redupkan lampu, kurangi stimulasi, goyang perlahan atau white noise.',
  },
}

let sessionPromise: Promise<ort.InferenceSession> | null = null
let melFilterCache: Float32Array[] | null = null
let hannCache: Float32Array | null = null

function configureOrt() {
  // Local wasm (copied to public/ort) — works offline after first load
  ort.env.wasm.wasmPaths = '/ort/'
  ort.env.wasm.numThreads = 1
}

export async function loadCryModel() {
  if (!sessionPromise) {
    configureOrt()
    sessionPromise = ort.InferenceSession.create(
      '/models/baby_cry_classification_resnet18.onnx',
      { executionProviders: ['wasm'] },
    )
  }
  return sessionPromise
}

function resampleLinear(input: Float32Array, fromSr: number, toSr: number) {
  if (fromSr === toSr) return input
  const newLen = Math.max(1, Math.round((input.length * toSr) / fromSr))
  const out = new Float32Array(newLen)
  const last = Math.max(1, input.length - 1)
  for (let i = 0; i < newLen; i++) {
    const t = (i * last) / Math.max(1, newLen - 1)
    const i0 = Math.floor(t)
    const i1 = Math.min(input.length - 1, i0 + 1)
    const frac = t - i0
    out[i] = input[i0] * (1 - frac) + input[i1] * frac
  }
  return out
}

function fixLength(y: Float32Array) {
  if (y.length === FIXED_LEN) return y
  if (y.length > FIXED_LEN) return y.subarray(0, FIXED_LEN)
  const out = new Float32Array(FIXED_LEN)
  out.set(y)
  return out
}

function hzToMel(hz: number) {
  return 2595 * Math.log10(1 + hz / 700)
}
function melToHz(mel: number) {
  return 700 * (10 ** (mel / 2595) - 1)
}

function melFilterbank(): Float32Array[] {
  if (melFilterCache) return melFilterCache
  const fmax = TARGET_SR / 2
  const nFreq = N_FFT / 2 + 1
  const melMin = hzToMel(0)
  const melMax = hzToMel(fmax)
  const mels = Array.from(
    { length: N_MELS + 2 },
    (_, i) => melMin + ((melMax - melMin) * i) / (N_MELS + 1),
  )
  const hz = mels.map(melToHz)
  const bins = hz.map((h) =>
    Math.min(nFreq - 1, Math.max(0, Math.floor(((N_FFT + 1) * h) / TARGET_SR))),
  )

  const fb: Float32Array[] = Array.from(
    { length: N_MELS },
    () => new Float32Array(nFreq),
  )

  for (let i = 0; i < N_MELS; i++) {
    let left = bins[i]
    let center = bins[i + 1]
    let right = bins[i + 2]
    if (center === left) center += 1
    if (right === center) right += 1
    for (let k = left; k < center; k++) {
      fb[i][k] = (k - left) / (center - left + 1e-9)
    }
    for (let k = center; k < right; k++) {
      fb[i][k] = (right - k) / (right - center + 1e-9)
    }
  }
  melFilterCache = fb
  return fb
}

function hannWindow() {
  if (hannCache) return hannCache
  const w = new Float32Array(N_FFT)
  for (let i = 0; i < N_FFT; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N_FFT - 1)))
  }
  hannCache = w
  return w
}

/** In-place radix-2 FFT (n must be power of 2) */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wlenRe = Math.cos(ang)
    const wlenIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j]
        const uIm = im[i + j]
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe
        re[i + j] = uRe + vRe
        im[i + j] = uIm + vIm
        re[i + j + len / 2] = uRe - vRe
        im[i + j + len / 2] = uIm - vIm
        const nextWRe = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nextWRe
      }
    }
  }
}

function stftPower(y: Float32Array): Float32Array[] {
  const nFreq = N_FFT / 2 + 1
  const window = hannWindow()
  const frames: Float32Array[] = []
  const re = new Float32Array(N_FFT)
  const im = new Float32Array(N_FFT)

  for (let start = 0; start + N_FFT <= y.length; start += HOP_LENGTH) {
    for (let n = 0; n < N_FFT; n++) {
      re[n] = y[start + n] * window[n]
      im[n] = 0
    }
    fft(re, im)
    const mag2 = new Float32Array(nFreq)
    for (let k = 0; k < nFreq; k++) {
      mag2[k] = re[k] * re[k] + im[k] * im[k]
    }
    frames.push(mag2)
  }
  return frames
}

function resize2d(m: number[][], th: number, tw: number): Float32Array {
  const H = m.length
  const W = m[0]?.length ?? 0
  const out = new Float32Array(th * tw)
  for (let i = 0; i < th; i++) {
    const hh = (i * (H - 1)) / Math.max(1, th - 1)
    const row = Math.min(H - 1, Math.max(0, Math.round(hh)))
    const src = m[row]
    for (let j = 0; j < tw; j++) {
      const ww = (j * (W - 1)) / Math.max(1, tw - 1)
      const c0 = Math.floor(ww)
      const c1 = Math.min(W - 1, c0 + 1)
      const frac = ww - c0
      out[i * tw + j] = src[c0] * (1 - frac) + src[c1] * frac
    }
  }
  return out
}

/** Build model input tensor flat data (1×1×224×224) from mono PCM */
export function audioToModelInput(
  samples: Float32Array,
  sampleRate: number,
): Float32Array {
  let y = resampleLinear(samples, sampleRate, TARGET_SR)
  y = fixLength(y)

  const frames = stftPower(y)
  const fb = melFilterbank()
  const nFrames = frames.length
  const mel: number[][] = Array.from({ length: N_MELS }, () =>
    new Array(nFrames).fill(0),
  )

  for (let t = 0; t < nFrames; t++) {
    const S = frames[t]
    for (let m = 0; m < N_MELS; m++) {
      let sum = 0
      const f = fb[m]
      for (let k = 0; k < f.length; k++) sum += f[k] * S[k]
      mel[m][t] = Math.max(sum, 1e-10)
    }
  }

  let min = Infinity
  let max = -Infinity
  for (let m = 0; m < N_MELS; m++) {
    for (let t = 0; t < nFrames; t++) {
      const db = 10 * Math.log10(mel[m][t])
      mel[m][t] = db
      if (db < min) min = db
      if (db > max) max = db
    }
  }
  const range = max - min + 1e-9
  for (let m = 0; m < N_MELS; m++) {
    for (let t = 0; t < nFrames; t++) {
      mel[m][t] = (mel[m][t] - min) / range
    }
  }

  return resize2d(mel, OUT, OUT)
}

function softmax(logits: ArrayLike<number>) {
  let max = -Infinity
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i])
  const exps = new Array(logits.length)
  let sum = 0
  for (let i = 0; i < logits.length; i++) {
    exps[i] = Math.exp(logits[i] - max)
    sum += exps[i]
  }
  return exps.map((e) => e / (sum + 1e-12))
}

export async function classifyCryWithMl(
  blob: Blob,
): Promise<CryAnalysisResult & { engine: 'ml'; source: string }> {
  const { samples, sampleRate } = await decodeAudioBlob(blob)
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
      engine: 'ml',
      source: 'blessingoraz/baby-cry-classifier',
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
      engine: 'ml',
      source: 'blessingoraz/baby-cry-classifier',
    }
  }

  const session = await loadCryModel()
  const input = audioToModelInput(samples, sampleRate)
  const tensor = new ort.Tensor('float32', input, [1, 1, OUT, OUT])
  const feeds: Record<string, ort.Tensor> = {
    [session.inputNames[0]]: tensor,
  }
  const out = await session.run(feeds)
  const logits = out[session.outputNames[0]].data as Float32Array
  const probs = softmax(logits)

  const predictions: CryPrediction[] = ML_CLASSES.map((cls, i) => {
    const meta = CLASS_META[cls]
    return {
      sound: cls,
      cause: meta.cause,
      label: meta.label,
      confidence: Math.round(probs[i] * 100),
      tip: meta.tip,
    }
  }).sort((a, b) => b.confidence - a.confidence)

  return {
    ok: true,
    durationSec: features.durationSec,
    rms: features.rms,
    predictions,
    top: predictions[0] ?? null,
    features,
    engine: 'ml',
    source: 'blessingoraz/baby-cry-classifier (ResNet18 ONNX)',
  }
}
