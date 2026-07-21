import { loadImage } from '../../lib/canvasImage'

export type ToolBackground =
  | { type: 'color'; value: string }
  | { type: 'image'; value: string }

export async function composeToolBackground(foregroundSrc: string, background: ToolBackground) {
  const foreground = await loadImage(foregroundSrc)
  const width = foreground.naturalWidth || foreground.width
  const height = foreground.naturalHeight || foreground.height
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持图片合成')

  canvas.width = width
  canvas.height = height

  if (background.type === 'color') {
    ctx.fillStyle = background.value
    ctx.fillRect(0, 0, width, height)
  } else {
    const image = await loadImage(background.value)
    const imageWidth = image.naturalWidth || image.width
    const imageHeight = image.naturalHeight || image.height
    const scale = Math.max(width / imageWidth, height / imageHeight)
    const drawWidth = imageWidth * scale
    const drawHeight = imageHeight * scale
    ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
  }

  ctx.drawImage(foreground, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}
