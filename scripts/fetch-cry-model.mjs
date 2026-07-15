#!/usr/bin/env node
/**
 * Download trained ONNX weights from blessingoraz/baby-cry-classifier (MIT)
 * and copy onnxruntime-web WASM assets for offline inference.
 */
import { mkdir, writeFile, access, copyFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'public/models')
const ortDir = path.join(root, 'public/ort')
const base =
  'https://github.com/blessingoraz/baby-cry-classifier/releases/download/v1.0.0'
const files = [
  'baby_cry_classification_resnet18.onnx',
  'baby_cry_classification_resnet18.onnx.data',
]

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function download(name) {
  const dest = path.join(outDir, name)
  if (await exists(dest)) {
    console.log('skip (exists):', name)
    return
  }
  const url = `${base}/${name}`
  console.log('downloading', url)
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Failed ${name}: ${res.status}`)
  await pipeline(res.body, createWriteStream(dest))
  console.log('saved', dest)
}

await mkdir(outDir, { recursive: true })
await mkdir(ortDir, { recursive: true })
await writeFile(
  path.join(outDir, 'SOURCE.txt'),
  [
    'Model: blessingoraz/baby-cry-classifier',
    'Release: v1.0.0',
    'License: MIT',
    'URL: https://github.com/blessingoraz/baby-cry-classifier/releases/tag/v1.0.0',
    '',
  ].join('\n'),
)
for (const f of files) await download(f)

const wasmSrc = path.join(
  root,
  'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
)
const wasmDest = path.join(ortDir, 'ort-wasm-simd-threaded.wasm')
if (await exists(wasmSrc)) {
  await copyFile(wasmSrc, wasmDest)
  console.log('copied ORT wasm')
} else {
  console.warn('onnxruntime-web wasm not found — run npm install first')
}
console.log('done')
