import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const resourcesDir = join(root, 'resources')

const sizes = [16, 24, 32, 48, 64, 128, 256]
const iconPath = join(resourcesDir, 'icon.ico')

function color(hex, alpha = 255) {
  const value = hex.replace('#', '')
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: alpha
  }
}

function blend(target, index, source, coverage = 1) {
  const alpha = (source.a / 255) * Math.max(0, Math.min(1, coverage))
  const inverse = 1 - alpha
  target[index] = Math.round(source.r * alpha + target[index] * inverse)
  target[index + 1] = Math.round(source.g * alpha + target[index + 1] * inverse)
  target[index + 2] = Math.round(source.b * alpha + target[index + 2] * inverse)
  target[index + 3] = Math.round(255 * alpha + target[index + 3] * inverse)
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay)

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  const x = ax + t * dx
  const y = ay + t * dy
  return Math.hypot(px - x, py - y)
}

function roundedRectCoverage(x, y, left, top, right, bottom, radius) {
  const innerLeft = left + radius
  const innerRight = right - radius
  const innerTop = top + radius
  const innerBottom = bottom - radius

  if (x >= innerLeft && x <= innerRight && y >= top && y <= bottom) return 1
  if (x >= left && x <= right && y >= innerTop && y <= innerBottom) return 1

  const cx = x < innerLeft ? innerLeft : innerRight
  const cy = y < innerTop ? innerTop : innerBottom
  const distance = Math.hypot(x - cx, y - cy)
  return Math.max(0, Math.min(1, radius + 0.65 - distance))
}

function drawRoundedRect(image, size, rect, radius, fill) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const coverage = roundedRectCoverage(x + 0.5, y + 0.5, rect.x, rect.y, rect.x + rect.w, rect.y + rect.h, radius)
      if (coverage <= 0) continue
      blend(image, (y * size + x) * 4, fill, coverage)
    }
  }
}

function drawCircle(image, size, cx, cy, radius, fill) {
  for (let y = Math.floor(cy - radius - 2); y <= Math.ceil(cy + radius + 2); y += 1) {
    if (y < 0 || y >= size) continue
    for (let x = Math.floor(cx - radius - 2); x <= Math.ceil(cx + radius + 2); x += 1) {
      if (x < 0 || x >= size) continue
      const coverage = Math.max(0, Math.min(1, radius + 0.65 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)))
      if (coverage <= 0) continue
      blend(image, (y * size + x) * 4, fill, coverage)
    }
  }
}

function drawLine(image, size, points, strokeWidth, fill) {
  const radius = strokeWidth / 2
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let distance = Number.POSITIVE_INFINITY
      for (let i = 0; i < points.length - 1; i += 1) {
        distance = Math.min(
          distance,
          distanceToSegment(x + 0.5, y + 0.5, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y)
        )
      }
      const coverage = Math.max(0, Math.min(1, radius + 0.65 - distance))
      if (coverage <= 0) continue
      blend(image, (y * size + x) * 4, fill, coverage)
    }
  }

  for (const point of points) {
    drawCircle(image, size, point.x, point.y, radius, fill)
  }
}

function scalePoint(size, x, y) {
  const scale = size / 256
  return { x: x * scale, y: y * scale }
}

function drawIcon(size) {
  const image = Buffer.alloc(size * size * 4)
  const scale = size / 256

  drawRoundedRect(
    image,
    size,
    { x: 22 * scale, y: 28 * scale, w: 212 * scale, h: 200 * scale },
    38 * scale,
    color('#0b1115', 246)
  )
  drawLine(image, size, [scalePoint(size, 54, 181), scalePoint(size, 202, 181)], Math.max(2, 14 * scale), color('#65d7c2'))
  drawLine(
    image,
    size,
    [
      scalePoint(size, 58, 168),
      scalePoint(size, 97, 118),
      scalePoint(size, 133, 156),
      scalePoint(size, 189, 80),
      scalePoint(size, 209, 105)
    ],
    Math.max(3, 20 * scale),
    color('#ff5b6e')
  )
  drawCircle(image, size, 190 * scale, 80 * scale, Math.max(2.2, 15 * scale), color('#65d7c2'))
  drawLine(image, size, [scalePoint(size, 63, 62), scalePoint(size, 119, 62)], Math.max(2, 12 * scale), color('#f5faf8', 235))

  return image
}

function makeDib(size, rgba) {
  const headerSize = 40
  const pixelBytes = size * size * 4
  const maskRowBytes = Math.ceil(size / 32) * 4
  const maskBytes = maskRowBytes * size
  const dib = Buffer.alloc(headerSize + pixelBytes + maskBytes)

  dib.writeUInt32LE(headerSize, 0)
  dib.writeInt32LE(size, 4)
  dib.writeInt32LE(size * 2, 8)
  dib.writeUInt16LE(1, 12)
  dib.writeUInt16LE(32, 14)
  dib.writeUInt32LE(0, 16)
  dib.writeUInt32LE(pixelBytes + maskBytes, 20)
  dib.writeInt32LE(0, 24)
  dib.writeInt32LE(0, 28)
  dib.writeUInt32LE(0, 32)
  dib.writeUInt32LE(0, 36)

  let offset = headerSize
  for (let y = size - 1; y >= 0; y -= 1) {
    for (let x = 0; x < size; x += 1) {
      const source = (y * size + x) * 4
      dib[offset] = rgba[source + 2]
      dib[offset + 1] = rgba[source + 1]
      dib[offset + 2] = rgba[source]
      dib[offset + 3] = rgba[source + 3]
      offset += 4
    }
  }

  return dib
}

function makeIco(entries) {
  const headerSize = 6
  const directorySize = entries.length * 16
  const header = Buffer.alloc(headerSize + directorySize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  let offset = header.length
  const images = []
  entries.forEach((entry, index) => {
    const dib = makeDib(entry.size, entry.rgba)
    images.push(dib)
    const directoryOffset = headerSize + index * 16
    header[directoryOffset] = entry.size >= 256 ? 0 : entry.size
    header[directoryOffset + 1] = entry.size >= 256 ? 0 : entry.size
    header[directoryOffset + 2] = 0
    header[directoryOffset + 3] = 0
    header.writeUInt16LE(1, directoryOffset + 4)
    header.writeUInt16LE(32, directoryOffset + 6)
    header.writeUInt32LE(dib.length, directoryOffset + 8)
    header.writeUInt32LE(offset, directoryOffset + 12)
    offset += dib.length
  })

  return Buffer.concat([header, ...images])
}

mkdirSync(resourcesDir, { recursive: true })
writeFileSync(iconPath, makeIco(sizes.map((size) => ({ size, rgba: drawIcon(size) }))))
console.log(`Wrote ${iconPath}`)
