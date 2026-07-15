import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const svg = (size, radius) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="#0066cc"/>
  <path d="M256 116c-8 44-72 118-72 186a72 72 0 0 0 144 0c0-68-64-142-72-186z" fill="#ffffff"/>
  <circle cx="232" cy="316" r="18" fill="#0066cc" opacity="0.25"/>
</svg>`

await mkdir('public', { recursive: true })

const jobs = [
  ['public/pwa-192x192.png', 192, 96],
  ['public/pwa-512x512.png', 512, 116],
  ['public/pwa-maskable-512x512.png', 512, 0],
  ['public/apple-touch-icon.png', 180, 0],
]

for (const [file, size, radius] of jobs) {
  await sharp(Buffer.from(svg(size, radius))).resize(size, size).png().toFile(file)
  console.log('created', file)
}
