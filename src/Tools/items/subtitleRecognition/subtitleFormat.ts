import type { SubtitleSegment } from '../../adapters/mediaApi'

function formatTime(value: number, separator: ',' | '.') {
  const total = Math.max(0, Math.round(value * 1000))
  const hours = Math.floor(total / 3600000)
  const minutes = Math.floor((total % 3600000) / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const ms = total % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(ms).padStart(3, '0')}`
}

export function toSrt(segments: SubtitleSegment[]) {
  return segments.map((segment, idx) => [
    idx + 1,
    `${formatTime(segment.start, ',')} --> ${formatTime(segment.end, ',')}`,
    segment.text.trim(),
  ].join('\n')).join('\n\n')
}

export function toVtt(segments: SubtitleSegment[]) {
  const body = segments.map((segment) => [
    `${formatTime(segment.start, '.')} --> ${formatTime(segment.end, '.')}`,
    segment.text.trim(),
  ].join('\n')).join('\n\n')
  return `WEBVTT\n\n${body}`
}

export function toPlainText(segments: SubtitleSegment[]) {
  return segments.map((segment) => segment.text.trim()).filter(Boolean).join('\n')
}
