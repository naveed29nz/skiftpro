/**
 * Rasterize the SkiftPro clock mark into PWA icons.
 * The mark is the same Lucide clock used on the login tile (white stroke on navy).
 *
 *   npm install --no-save sharp && node scripts/generate-pwa-icons.mjs
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const NAVY = '#172554'
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public')

function clockSvg(size, boxRatio) {
  const box = size * boxRatio
  const scale = box / 24
  const offset = (size - box) / 2
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${NAVY}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </g>
</svg>`
}

const icons = [
  ['pwa-192x192.png', 192, 0.62],
  ['pwa-512x512.png', 512, 0.62],
  ['pwa-maskable-192x192.png', 192, 0.46],
  ['pwa-maskable-512x512.png', 512, 0.46],
  ['apple-touch-icon.png', 180, 0.62],
]

await mkdir(outDir, { recursive: true })
for (const [name, size, boxRatio] of icons) {
  const file = path.join(outDir, name)
  await sharp(Buffer.from(clockSvg(size, boxRatio))).png().toFile(file)
  console.log(file)
}
