import { loadImage } from '../../lib/canvasImage'

export type EdgeRefinement = {
  shift: number
  feather: number
  decontaminate: number
}

function blurAlpha(source: Uint8ClampedArray, width: number, height: number, radius: number) {
  if (!radius) return source
  const horizontal = new Uint8ClampedArray(source.length)
  const output = new Uint8ClampedArray(source.length)

  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = 0
    for (let x = 0; x <= Math.min(radius, width - 1); x++) sum += source[row + x]
    for (let x = 0; x < width; x++) {
      const start = Math.max(0, x - radius)
      const end = Math.min(width - 1, x + radius)
      horizontal[row + x] = Math.round(sum / (end - start + 1))
      if (x - radius >= 0) sum -= source[row + x - radius]
      if (x + radius + 1 < width) sum += source[row + x + radius + 1]
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = 0; y <= Math.min(radius, height - 1); y++) sum += horizontal[y * width + x]
    for (let y = 0; y < height; y++) {
      const start = Math.max(0, y - radius)
      const end = Math.min(height - 1, y + radius)
      output[y * width + x] = Math.round(sum / (end - start + 1))
      if (y - radius >= 0) sum -= horizontal[(y - radius) * width + x]
      if (y + radius + 1 < height) sum += horizontal[(y + radius + 1) * width + x]
    }
  }

  return output
}

export function refineEdgePixels(source: Uint8ClampedArray, width: number, height: number, opts: EdgeRefinement) {
  const output = new Uint8ClampedArray(source)
  const alpha = new Uint8ClampedArray(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = source[i * 4 + 3]

  const refinedAlpha = blurAlpha(alpha, width, height, opts.feather)
  for (let i = 0; i < refinedAlpha.length; i++) {
    const value = refinedAlpha[i]
    refinedAlpha[i] = opts.shift > 0
      ? value <= opts.shift ? 0 : Math.round(((value - opts.shift) * 255) / (255 - opts.shift))
      : opts.shift < 0
        ? value >= 255 + opts.shift ? 255 : Math.round((value * 255) / (255 + opts.shift))
        : value
    output[i * 4 + 3] = refinedAlpha[i]
  }

  if (!opts.decontaminate) return output
  const strength = opts.decontaminate / 100
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x
      const alphaValue = refinedAlpha[pixel]
      if (alphaValue <= 8 || alphaValue >= 250) continue

      let red = 0
      let green = 0
      let blue = 0
      let total = 0
      for (let offsetY = -2; offsetY <= 2; offsetY++) {
        const nearY = y + offsetY
        if (nearY < 0 || nearY >= height) continue
        for (let offsetX = -2; offsetX <= 2; offsetX++) {
          const nearX = x + offsetX
          if (nearX < 0 || nearX >= width || (!offsetX && !offsetY)) continue
          const nearPixel = nearY * width + nearX
          const nearAlpha = refinedAlpha[nearPixel]
          if (nearAlpha <= alphaValue + 24) continue
          const weight = nearAlpha - alphaValue
          const nearIndex = nearPixel * 4
          red += source[nearIndex] * weight
          green += source[nearIndex + 1] * weight
          blue += source[nearIndex + 2] * weight
          total += weight
        }
      }
      if (!total) continue

      const index = pixel * 4
      const mix = strength * Math.min(1, (255 - alphaValue) / 160)
      output[index] = Math.round(source[index] * (1 - mix) + (red / total) * mix)
      output[index + 1] = Math.round(source[index + 1] * (1 - mix) + (green / total) * mix)
      output[index + 2] = Math.round(source[index + 2] * (1 - mix) + (blue / total) * mix)
    }
  }

  return output
}

export async function refineToolEdges(source: string, opts: EdgeRefinement) {
  const image = await loadImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('浏览器不支持边缘优化')

  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  pixels.data.set(refineEdgePixels(pixels.data, canvas.width, canvas.height, opts))
  ctx.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/png')
}
