import type { SubtitleCue, SubtitleStyle } from '../types'

export type SubtitleRenderFile = {
  name: string
  file: Blob
  start: number
  end: number
  x: number
  y: number
}

export function wrapSubtitleText(text: string, maxWidth: number, measure: (value: string) => number) {
  return text.split('\n').flatMap((paragraph) => {
    const lines: string[] = []
    let line = ''
    Array.from(paragraph).forEach((char) => {
      const next = line + char
      if (line && measure(next) > maxWidth) {
        lines.push(line.trim())
        line = char.trimStart()
        return
      }
      line = next
    })
    lines.push(line.trim())
    return lines
  })
}

export async function renderSubtitleFiles(cues: SubtitleCue[], style: SubtitleStyle, size: { width: number, height: number }, onProgress: (value: number) => void) {
  const scale = size.height / 720
  const fontSize = Math.max(18, Math.round(style.fontSize * scale))
  const padding = Math.round(fontSize * 0.55)
  const lineHeight = Math.round(fontSize * 1.3)
  const width = Math.round(size.width * 0.88)
  const files: SubtitleRenderFile[] = []

  for (let idx = 0; idx < cues.length; idx += 1) {
    const cue = cues[idx]
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('浏览器不支持字幕画布')
    ctx.font = `600 ${fontSize}px sans-serif`
    const lines = wrapSubtitleText(cue.text, width - padding * 2, (value) => ctx.measureText(value).width)
    canvas.width = width
    canvas.height = Math.max(lineHeight + padding * 2, lines.length * lineHeight + padding * 2)
    ctx.font = `600 ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (style.backgroundOpacity > 0) {
      ctx.fillStyle = `rgb(0 0 0 / ${style.backgroundOpacity})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.fillStyle = style.color
    lines.forEach((line, lineIdx) => ctx.fillText(line, canvas.width / 2, padding + lineHeight * (lineIdx + 0.5)))
    const file = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('字幕图片生成失败')), 'image/png'))
    const edge = Math.round(size.height * 0.08)
    const y = style.position === 'top'
      ? edge
      : style.position === 'middle'
        ? Math.round((size.height - canvas.height) / 2)
        : size.height - canvas.height - edge
    files.push({ name: `subtitle-${idx}.png`, file, start: cue.start, end: cue.end, x: Math.round((size.width - canvas.width) / 2), y })
    onProgress((idx + 1) / cues.length)
  }

  return files
}
