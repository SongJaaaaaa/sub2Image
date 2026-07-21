import type { InputImage } from '../types'

const MENTION_START = '\u2063'
const MENTION_END = '\u2064'
const MENTION_META = '\u2062'
const IMAGE_MENTION_RE = /(?:\u2063)?@图(\d+)(?:\u2064)?/g
const SELECTED_IMAGE_MENTION_RE = /\u2063@图(\d+)\u2064/g
const SELECTED_MENTION_RE = /\u2063(@图(\d+)|@(?:第)?\d+轮图\d+)\u2064/g
const STRUCTURED_MENTION_RE = /\u2063([^\u2062\u2064]+)\u2062([a-z-]+):([a-z0-9-]+)\u2064/g

export interface AtImageQuery {
  start: number
  query: string
}

export function getImageMentionLabel(index: number) {
  return `@图${index + 1}`
}

export function getSelectedImageMentionLabel(index: number) {
  return getSelectedTextMentionLabel(getImageMentionLabel(index))
}

export function getSelectedTextMentionLabel(text: string) {
  return `${MENTION_START}${text}${MENTION_END}`
}

export function getSelectedStructuredMentionLabel(text: string, type: string, id: string) {
  return `${MENTION_START}${text}${MENTION_META}${type}:${id}${MENTION_END}`
}

export function getStructuredMentions(prompt: string) {
  return [...prompt.matchAll(STRUCTURED_MENTION_RE)].map((match) => ({
    raw: match[0],
    label: match[1],
    type: match[2],
    id: match[3],
    index: match.index,
  }))
}

export function restoreImageMentionMarkers(prompt: string, imageCount: number) {
  return prompt.replace(IMAGE_MENTION_RE, (text, n) => {
    const index = Number(n) - 1
    if (index < 0 || index >= imageCount) return stripImageMentionMarkers(text)
    return getSelectedImageMentionLabel(index)
  })
}

export function stripImageMentionMarkers(prompt: string): string {
  return prompt
    .replace(STRUCTURED_MENTION_RE, (_match, label: string) => label)
    .replace(/[\u2062\u2063\u2064]/g, '')
}

export function getPromptIndexFromVisibleIndex(prompt: string, visibleIndex: number): number {
  let visible = 0
  for (let i = 0; i < prompt.length;) {
    const structured = prompt[i] === MENTION_START
      ? prompt.slice(i).match(/^\u2063([^\u2062\u2064]+)\u2062[a-z-]+:[a-z0-9-]+\u2064/)
      : null
    if (structured) {
      if (visibleIndex <= visible) return i
      if (visibleIndex <= visible + structured[1].length) return i + structured[0].length
      visible += structured[1].length
      i += structured[0].length
      continue
    }
    if (prompt[i] === MENTION_START || prompt[i] === MENTION_END) {
      i++
      continue
    }
    if (visible >= visibleIndex) return i
    visible++
    i++
  }
  return prompt.length
}

export function isCursorInSelectedImageMention(prompt: string, visibleCursor: number): boolean {
  const matches = [
    ...[...prompt.matchAll(SELECTED_MENTION_RE)].map((match) => ({ match, label: match[1] })),
    ...[...prompt.matchAll(STRUCTURED_MENTION_RE)].map((match) => ({ match, label: match[1] })),
  ]
  for (const item of matches) {
    if (item.match.index == null) continue
    const visibleStart = stripImageMentionMarkers(prompt.slice(0, item.match.index)).length
    const visibleEnd = visibleStart + item.label.length
    if (visibleCursor > visibleStart && visibleCursor <= visibleEnd) return true
  }
  return false
}

export function getAtImageQuery(prompt: string, cursor: number, imageSource: Pick<InputImage[], 'length'>): AtImageQuery | null {
  if (imageSource.length === 0) return null

  const beforeCursor = prompt.slice(0, cursor)
  const atIndex = beforeCursor.lastIndexOf('@')
  if (atIndex < 0) return null

  const query = beforeCursor.slice(atIndex + 1)
  if (/\s/.test(query)) return null
  return { start: atIndex, query }
}

export function imageMentionMatches(query: string, index: number) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  const oneBasedIndex = String(index + 1)
  const label = `图${oneBasedIndex}`
  return oneBasedIndex.includes(normalized) || label.toLowerCase().includes(normalized)
}

export function insertImageMention(prompt: string, start: number, cursor: number, imageIndex: number) {
  const mention = getSelectedImageMentionLabel(imageIndex)
  const visibleMention = getImageMentionLabel(imageIndex)
  const nextPrompt = `${prompt.slice(0, start)}${mention}${prompt.slice(cursor)}`
  return {
    prompt: nextPrompt,
    cursor: start + visibleMention.length,
  }
}

export function insertImageMentionAtVisibleRange(prompt: string, start: number, cursor: number, imageIndex: number) {
  return insertTextMentionAtVisibleRange(prompt, start, cursor, getImageMentionLabel(imageIndex))
}

export function insertStructuredMentionAtVisibleRange(prompt: string, start: number, cursor: number, text: string, type: string, id: string) {
  const promptStart = getPromptIndexFromVisibleIndex(prompt, start)
  const promptCursor = getPromptIndexFromVisibleIndex(prompt, cursor)
  return {
    prompt: `${prompt.slice(0, promptStart)}${getSelectedStructuredMentionLabel(text, type, id)}${prompt.slice(promptCursor)}`,
    cursor: start + text.length,
  }
}

export function insertTextMentionAtVisibleRange(prompt: string, start: number, cursor: number, text: string) {
  const promptStart = getPromptIndexFromVisibleIndex(prompt, start)
  const promptCursor = getPromptIndexFromVisibleIndex(prompt, cursor)
  const mention = getSelectedTextMentionLabel(text)
  return {
    prompt: `${prompt.slice(0, promptStart)}${mention}${prompt.slice(promptCursor)}`,
    cursor: start + text.length,
  }
}

export function remapImageMentionsForOrder(
  prompt: string,
  previousImages: InputImage[],
  nextImages: InputImage[],
  equivalentImageIds: Record<string, string> = {},
): string {
  return prompt.replace(SELECTED_IMAGE_MENTION_RE, (text, n) => {
    const previousImage = previousImages[Number(n) - 1]
    if (!previousImage) return text

    const nextImageId = equivalentImageIds[previousImage.id] ?? previousImage.id
    const nextIndex = nextImages.findIndex((img) => img.id === nextImageId)
    return nextIndex >= 0 ? getSelectedImageMentionLabel(nextIndex) : '@已移除图片'
  })
}

export type PromptMentionPart =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; imageIndex: number; mentionText?: string }
  | { type: 'mention'; text: string; mentionText: string; imageIndex?: never }

export function getPromptMentionParts(prompt: string, inputImages: InputImage[]): PromptMentionPart[] {
  const parts: PromptMentionPart[] = []
  let lastIndex = 0

  const matches = [
    ...[...prompt.matchAll(SELECTED_MENTION_RE)].map((match) => ({ match, text: match[1], imageIndex: match[2] ? Number(match[2]) - 1 : null })),
    ...[...prompt.matchAll(STRUCTURED_MENTION_RE)].map((match) => ({ match, text: match[1], imageIndex: null })),
  ].sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0))

  for (const item of matches) {
    const match = item.match
    const text = item.text
    const index = item.imageIndex
    if (match.index == null) continue
    if (index != null && !inputImages[index]) continue

    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: stripImageMentionMarkers(prompt.slice(lastIndex, match.index)) })
    }
    parts.push(index == null
      ? { type: 'mention', text, mentionText: match[0] }
      : { type: 'mention', text, imageIndex: index })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < prompt.length) {
    parts.push({ type: 'text', text: stripImageMentionMarkers(prompt.slice(lastIndex)) })
  }

  return parts.length > 0 ? parts : [{ type: 'text', text: stripImageMentionMarkers(prompt) }]
}

export function replaceImageMentionsForApi(prompt: string, imageCount?: number, formatImage?: (index: number) => string): string {
  return prompt.replace(SELECTED_IMAGE_MENTION_RE, (text, n) => {
    const index = Number(n) - 1
    if (imageCount != null && (index < 0 || index >= imageCount)) return stripImageMentionMarkers(text)
    return formatImage ? formatImage(index) : `[image ${n}]`
  })
}
