import type { SubtitleCue } from '../types'

function parseTime(value: string) {
  const parts = value.trim().replace(',', '.').split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return -1
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return -1
}

export function parseSubtitle(text: string) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n')
  const cues: SubtitleCue[] = []

  for (let idx = 0; idx < lines.length; idx += 1) {
    if (!lines[idx].includes('-->')) continue
    const [from, rest] = lines[idx].split(/\s+-->\s+/)
    const to = rest?.trim().split(/\s+/)[0] || ''
    const start = parseTime(from)
    const end = parseTime(to)
    const content: string[] = []
    idx += 1
    while (idx < lines.length && lines[idx].trim()) {
      content.push(lines[idx])
      idx += 1
    }
    const cueText = content.join('\n').replace(/<[^>]+>/g, '').trim()
    if (start < 0 || end <= start || !cueText) continue
    cues.push({ id: `subtitle-${cues.length + 1}`, start, end, text: cueText })
  }

  return cues
}

export function fitSubtitles(cues: SubtitleCue[], duration: number) {
  return cues
    .filter((cue) => cue.start < duration && cue.end > 0)
    .map((cue) => ({ ...cue, start: Math.max(0, cue.start), end: Math.min(duration, cue.end) }))
    .filter((cue) => cue.end - cue.start >= 0.05)
}

export function getActiveSubtitle(cues: SubtitleCue[], time: number) {
  return cues.find((cue) => cue.start <= time && cue.end > time)
}
