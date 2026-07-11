import type { PromptCache, RemotePrompt } from '../types'
import { getAllPromptCaches, putPromptCache } from './db'

export type PromptSourceInfo = {
  id: string
  label: string
  sourceUrl: string
  license: string
  model: string
}

type PromptSource = PromptSourceInfo & {
  rawBase: string
  file: string
  parse: (content: string, source: PromptSourceInfo) => RemotePrompt[]
}

export type PromptLibraryResult = {
  items: RemotePrompt[]
  failedSources: string[]
}

export type PromptCacheState = {
  items: RemotePrompt[]
  needsRefresh: boolean
}

type DavidWuPrompt = {
  id?: number
  title_en?: string
  title_cn?: string
  category?: string
  category_cn?: string
  prompt?: string
  note?: string
  author?: string
  source?: string
  needs_ref?: boolean
  image?: string
}

const CACHE_TTL = 60 * 60 * 1000

const sourceInfo = (
  id: string,
  label: string,
  sourceUrl: string,
  license: string,
  model: string,
): PromptSourceInfo => ({ id, label, sourceUrl, license, model })

export const PROMPT_SOURCES: PromptSourceInfo[] = [
  sourceInfo('awesome-gpt-image', 'ZeroLu / Awesome GPT Image', 'https://github.com/ZeroLu/awesome-gpt-image', 'MIT', 'GPT Image 2'),
  sourceInfo('awesome-gpt4o-image-prompts', 'ImgEdify / GPT-4o Prompts', 'https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts', 'MIT', 'GPT-4o'),
  sourceInfo('youmind-gpt-image-2', 'YouMind / GPT Image 2', 'https://github.com/YouMind-OpenLab/awesome-gpt-image-2', 'CC BY 4.0', 'GPT Image 2'),
  sourceInfo('youmind-nano-banana-pro', 'YouMind / Nano Banana Pro', 'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts', 'CC BY 4.0', 'Nano Banana Pro'),
  sourceInfo('davidwu-gpt-image2-prompts', 'David Wu / GPT Image 2', 'https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts', '许可证未声明', 'GPT Image 2'),
]

const sourceById = new Map(PROMPT_SOURCES.map((source) => [source.id, source]))

const sources: PromptSource[] = [
  {
    ...PROMPT_SOURCES[0],
    rawBase: 'https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main',
    file: 'README.zh-CN.md',
    parse: parseAwesomeGptImage,
  },
  {
    ...PROMPT_SOURCES[1],
    rawBase: 'https://raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main',
    file: 'README.zh-CN.md',
    parse: parseAwesomeGpt4o,
  },
  {
    ...PROMPT_SOURCES[2],
    rawBase: 'https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main',
    file: 'README_zh.md',
    parse: parseYouMind,
  },
  {
    ...PROMPT_SOURCES[3],
    rawBase: 'https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main',
    file: 'README_zh.md',
    parse: parseYouMind,
  },
  {
    ...PROMPT_SOURCES[4],
    rawBase: 'https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main',
    file: 'prompts.json',
    parse: parseDavidWu,
  },
]

export async function getPromptCacheState(): Promise<PromptCacheState> {
  const caches = await getAllPromptCaches()
  const cacheById = new Map(caches.map((cache) => [cache.id, cache]))
  const now = Date.now()

  return {
    items: sources.flatMap((source) => cacheById.get(source.id)?.items || []),
    needsRefresh: sources.some((source) => {
      const cache = cacheById.get(source.id)
      return !cache || now - cache.updatedAt > CACHE_TTL
    }),
  }
}

export async function refreshPromptLibrary(): Promise<PromptLibraryResult> {
  const caches = await getAllPromptCaches()
  const cacheById = new Map(caches.map((cache) => [cache.id, cache]))

  const results = await Promise.all(sources.map(async (source) => {
    try {
      const response = await fetch(`${source.rawBase}/${source.file}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const content = await response.text()
      const items = source.parse(content, source)
      if (!items.length) throw new Error('没有解析到提示词')
      await putPromptCache({ id: source.id, items, updatedAt: Date.now() })
      return { items, failed: false }
    } catch (err) {
      console.warn(`提示词来源加载失败: ${source.id}`, err)
      return { items: cacheById.get(source.id)?.items || [], failed: true }
    }
  }))

  return {
    items: results.flatMap((result) => result.items),
    failedSources: results.flatMap((result, index) => result.failed ? [sources[index].id] : []),
  }
}

export function filterPromptLibrary(
  items: RemotePrompt[],
  query: string,
  sourceId: string,
  tag: string,
) {
  const q = query.trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (sourceId && item.source !== sourceId) return false
    if (tag && !item.tags.includes(tag)) return false
    if (!q) return true
    return [item.title, item.prompt, item.model, item.source, getPromptSource(item.source)?.label || '', ...item.tags]
      .join('\n')
      .toLocaleLowerCase()
      .includes(q)
  })
}

export function getPromptSource(id: string) {
  return sourceById.get(id)
}

export function parseAwesomeGptImage(markdown: string, source: PromptSourceInfo = PROMPT_SOURCES[0]) {
  const items: RemotePrompt[] = []
  for (const section of splitHeading(markdown, '## ')) {
    const tags = splitTags(firstMatch(section, /^##\s+(.+)$/m).replace(/[^\p{L}\p{N}/&、与 ]/gu, ''), /\s*(?:\/|&|、|与)\s*/)
    for (const block of splitHeading(section, '### ')) {
      const title = firstMatch(block, /^###\s+(.+)$/m).replace(/\[([^\]]+)]\([^)]+\)/g, '$1').trim()
      const prompt = firstMatch(block, /\*\*提示词:\*\*\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/).trim()
      if (!title || !prompt) continue
      items.push(makePrompt(source, items.length, title, prompt, tags, extractImages(sourceRawBase(source.id), block)[0] || ''))
    }
  }
  return items
}

export function parseAwesomeGpt4o(markdown: string, source: PromptSourceInfo = PROMPT_SOURCES[1]) {
  const items: RemotePrompt[] = []
  for (const block of splitHeading(markdown, '### ')) {
    const title = firstMatch(block, /^###\s+(.+)$/m).trim()
    const prompt = firstMatch(block, /- \*\*提示词文本：\*\*\s*`([\s\S]*?)`\s*(?:\r?\n|$)/).trim()
    if (!title || !prompt) continue
    const model = firstMatch(block, /- \*\*模型：\*\*\s*([^\r\n]+)/).trim()
    const tags = model ? [model.toLocaleLowerCase()] : ['gpt4o']
    items.push(makePrompt(source, items.length, title, prompt, tags, extractImages(sourceRawBase(source.id), block)[0] || ''))
  }
  return items
}

export function parseYouMind(markdown: string, source: PromptSourceInfo = PROMPT_SOURCES[2]) {
  const items: RemotePrompt[] = []
  for (const block of splitHeading(markdown, '### ')) {
    const title = firstMatch(block, /^###\s+No\.\s*\d+:\s*(.+)$/m).trim()
    const prompt = firstMatch(block, /#### .*?提示词\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/).trim()
    if (!title || !prompt) continue
    const prefix = firstMatch(title, /^(.+?) - /)
    const tags = [source.model.toLocaleLowerCase(), ...splitTags(prefix.replace(/[^\p{L}\p{N}/&、与 ]/gu, ''), /\s*(?:\/|&|、|与)\s*/)]
    items.push(makePrompt(source, items.length, title, prompt, tags, extractImages(sourceRawBase(source.id), block)[0] || ''))
  }
  return items
}

export function parseDavidWu(content: string, source: PromptSourceInfo = PROMPT_SOURCES[4]) {
  const data = JSON.parse(content) as DavidWuPrompt[]
  return data.flatMap((item, index) => {
    const title = (item.title_cn || item.title_en || '').trim()
    const prompt = (item.prompt || '').trim()
    if (!title || !prompt) return []
    const tags = splitTags([item.category_cn, item.category, item.author, item.source].filter(Boolean).join('/'), /\//)
    if (item.needs_ref) tags.push('需要参考图')
    return [makePrompt(source, item.id ? item.id - 1 : index, title, prompt, tags, absoluteUrl(sourceRawBase(source.id), item.image || ''))]
  })
}

function makePrompt(
  source: PromptSourceInfo,
  index: number,
  title: string,
  prompt: string,
  tags: string[],
  coverUrl: string,
): RemotePrompt {
  return {
    id: `${source.id}-${String(index + 1).padStart(4, '0')}`,
    title,
    prompt,
    coverUrl,
    tags: Array.from(new Set(tags.filter(Boolean))),
    model: source.model,
    source: source.id,
    sourceUrl: source.sourceUrl,
    license: source.license,
  }
}

function sourceRawBase(id: string) {
  return sources.find((source) => source.id === id)?.rawBase || ''
}

function splitHeading(markdown: string, prefix: string) {
  const blocks: string[] = []
  let lines: string[] = []
  for (const line of markdown.split('\n')) {
    if (line.startsWith(prefix) && lines.length) {
      blocks.push(lines.join('\n'))
      lines = []
    }
    lines.push(line)
  }
  if (lines.length) blocks.push(lines.join('\n'))
  return blocks
}

function firstMatch(value: string, pattern: RegExp) {
  return pattern.exec(value)?.[1] || ''
}

function extractImages(baseUrl: string, value: string) {
  const markdownImages = Array.from(value.matchAll(/!\[[^\]]*]\(([^)]+)\)/g), (match) => match[1])
  const htmlImages = Array.from(value.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi), (match) => match[1])
  return [...markdownImages, ...htmlImages].map((image) => absoluteUrl(baseUrl, image))
}

function absoluteUrl(baseUrl: string, value: string) {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value.replace(/&amp;/g, '&')
  return `${baseUrl}/${value.replace(/^\.?\//, '')}`
}

function splitTags(value: string, separator: RegExp) {
  return value
    .split(separator)
    .map((tag) => tag.trim().toLocaleLowerCase())
    .filter(Boolean)
}
