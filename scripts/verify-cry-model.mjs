/**
 * Offline verification of ONNX cry classifier against Donate-a-Cry samples.
 * Usage: node scripts/verify-cry-model.mjs
 */
import ort from 'onnxruntime-node'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const MODEL = path.join(root, 'public/models/baby_cry_classification_resnet18.onnx')

const CLASSES = [
  'belly_pain',
  'burping',
  'cold_hot',
  'discomfort',
  'hungry',
  'lonely',
  'scared',
  'tired',
]

const TARGET_SR = 8000
const FIXED_LEN = TARGET_SR * 7
const N_MELS = 128
const N_FFT = 1024
const HOP = 256
const OUT = 224

function parseWav(buf) {
  // Minimal PCM16/float WAV reader
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (String.fromCharCode(...buf.subarray(0, 4)) !== 'RIFF') throw new Error('not wav')
  let offset = 12
  let sampleRate = 0
  let channels = 1
  let bits = 16
  let dataOffset = 0
  let dataSize = 0
  while (offset + 8 <= buf.length) {
    const id = String.fromCharCode(...buf.subarray(offset, offset + 4))
    const size = view.getUint32(offset + 4, true)
    if (id === 'fmt ') {
      channels = view.getUint16(offset + 10, true)
      sampleRate = view.getUint32(offset + 12, true)
      bits = view.getUint16(offset + 22, true)
    } else if (id === 'data') {
      dataOffset = offset + 8
      dataSize = size
      break
    }
    offset += 8 + size + (size % 2)
  }
  const samples = new Float32Array(Math.floor(dataSize / (bits / 8) / channels))
  if (bits === 16) {
    let si = 0
    for (let i = 0; i < samples.length; i++) {
      let sum = 0
      for (let c = 0; c < channels; c++) {
        sum += view.getInt16(dataOffset + (si + c) * 2, true) / 32768
      }
      samples[i] = sum / channels
      si += channels
    }
  } else if (bits === 32) {
    let si = 0
    for (let i = 0; i < samples.length; i++) {
      let sum = 0
      for (let c = 0; c < channels; c++) {
        sum += view.getFloat32(dataOffset + (si + c) * 4, true)
      }
      samples[i] = sum / channels
      si += channels
    }
  } else throw new Error(`unsupported bits ${bits}`)
  return { samples, sampleRate }
}

function resample(input, fromSr, toSr) {
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

function fixLen(y) {
  if (y.length === FIXED_LEN) return y
  if (y.length > FIXED_LEN) return y.subarray(0, FIXED_LEN)
  const o = new Float32Array(FIXED_LEN)
  o.set(y)
  return o
}

function hzToMel(hz) {
  return 2595 * Math.log10(1 + hz / 700)
}
function melToHz(mel) {
  return 700 * (10 ** (mel / 2595) - 1)
}

function melFb() {
  const nFreq = N_FFT / 2 + 1
  const melMin = hzToMel(0)
  const melMax = hzToMel(TARGET_SR / 2)
  const mels = Array.from({ length: N_MELS + 2 }, (_, i) => melMin + ((melMax - melMin) * i) / (N_MELS + 1))
  const bins = mels.map(melToHz).map((h) => Math.min(nFreq - 1, Math.max(0, Math.floor(((N_FFT + 1) * h) / TARGET_SR))))
  const fb = Array.from({ length: N_MELS }, () => new Float32Array(nFreq))
  for (let i = 0; i < N_MELS; i++) {
    let left = bins[i], center = bins[i + 1], right = bins[i + 2]
    if (center === left) center++
    if (right === center) right++
    for (let k = left; k < center; k++) fb[i][k] = (k - left) / (center - left + 1e-9)
    for (let k = center; k < right; k++) fb[i][k] = (right - k) / (right - center + 1e-9)
  }
  return fb
}

function fft(re, im) {
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
    const wlenRe = Math.cos(ang), wlenIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wRe = 1, wIm = 0
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j], uIm = im[i + j]
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe
        re[i + j] = uRe + vRe
        im[i + j] = uIm + vIm
        re[i + j + len / 2] = uRe - vRe
        im[i + j + len / 2] = uIm - vIm
        const nRe = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nRe
      }
    }
  }
}

function toInput(samples, sr) {
  let y = fixLen(resample(samples, sr, TARGET_SR))
  const window = new Float32Array(N_FFT)
  for (let i = 0; i < N_FFT; i++) window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N_FFT - 1)))
  const nFreq = N_FFT / 2 + 1
  const frames = []
  const re = new Float32Array(N_FFT)
  const im = new Float32Array(N_FFT)
  for (let start = 0; start + N_FFT <= y.length; start += HOP) {
    for (let n = 0; n < N_FFT; n++) {
      re[n] = y[start + n] * window[n]
      im[n] = 0
    }
    fft(re, im)
    const mag2 = new Float32Array(nFreq)
    for (let k = 0; k < nFreq; k++) mag2[k] = re[k] * re[k] + im[k] * im[k]
    frames.push(mag2)
  }
  const fb = melFb()
  const mel = Array.from({ length: N_MELS }, () => new Array(frames.length).fill(0))
  for (let t = 0; t < frames.length; t++) {
    for (let m = 0; m < N_MELS; m++) {
      let s = 0
      for (let k = 0; k < nFreq; k++) s += fb[m][k] * frames[t][k]
      mel[m][t] = Math.max(s, 1e-10)
    }
  }
  let min = Infinity, max = -Infinity
  for (let m = 0; m < N_MELS; m++) {
    for (let t = 0; t < frames.length; t++) {
      const db = 10 * Math.log10(mel[m][t])
      mel[m][t] = db
      if (db < min) min = db
      if (db > max) max = db
    }
  }
  const range = max - min + 1e-9
  for (let m = 0; m < N_MELS; m++) for (let t = 0; t < frames.length; t++) mel[m][t] = (mel[m][t] - min) / range

  const out = new Float32Array(OUT * OUT)
  for (let i = 0; i < OUT; i++) {
    const row = Math.min(N_MELS - 1, Math.max(0, Math.round((i * (N_MELS - 1)) / (OUT - 1))))
    const src = mel[row]
    const W = src.length
    for (let j = 0; j < OUT; j++) {
      const ww = (j * (W - 1)) / (OUT - 1)
      const c0 = Math.floor(ww), c1 = Math.min(W - 1, c0 + 1), frac = ww - c0
      out[i * OUT + j] = src[c0] * (1 - frac) + src[c1] * frac
    }
  }
  return out
}

function softmax(logits) {
  let m = -Infinity
  for (const v of logits) m = Math.max(m, v)
  const e = [...logits].map((v) => Math.exp(v - m))
  const s = e.reduce((a, b) => a + b, 0)
  return e.map((v) => v / s)
}

async function predict(file) {
  const buf = await readFile(file)
  const { samples, sampleRate } = parseWav(buf)
  const input = toInput(samples, sampleRate)
  const session = await ort.InferenceSession.create(MODEL)
  const tensor = new ort.Tensor('float32', input, [1, 1, OUT, OUT])
  const out = await session.run({ [session.inputNames[0]]: tensor })
  const probs = softmax(out[session.outputNames[0]].data)
  const ranked = CLASSES.map((c, i) => [c, probs[i]]).sort((a, b) => b[1] - a[1])
  return ranked
}

const cases = [
  ['hungry', path.join(root, 'tmp/cry-samples/hungry.wav')],
  ['tired', path.join(root, 'tmp/cry-samples/tired.wav')],
]

let ok = true
for (const [expected, file] of cases) {
  const ranked = await predict(file)
  const top = ranked[0]
  console.log(`\n${path.basename(file)} (expected: ${expected})`)
  for (const [c, p] of ranked.slice(0, 4)) {
    console.log(`  ${c.padEnd(12)} ${(p * 100).toFixed(1)}%`)
  }
  if (top[0] !== expected) {
    console.log(`  ❌ top=${top[0]}`)
    ok = false
  } else {
    console.log(`  ✅ match`)
  }
}

process.exit(ok ? 0 : 1)
