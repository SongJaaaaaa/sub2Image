import { appendStreamingFormatHint } from './shared'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getStringValue(source: Record<string, unknown>, key: string) {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function getNumberValue(source: Record<string, unknown>, key: string) {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

function getStreamError(event: Record<string, unknown>) {
  const error = event.error
  if (isRecord(error)) {
    const message = getStringValue(error, 'message')
    if (message) return message
  }
  if (typeof error === 'string' && error.trim()) return error

  const type = getStringValue(event, 'type')
  if (type?.endsWith('.failed')) return getStringValue(event, 'message') ?? '流式请求失败'
  return null
}

function parseEventBlock(block: string) {
  const dataLines: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':') || !line.startsWith('data:')) continue
    dataLines.push(line.slice(5).replace(/^ /, ''))
  }

  const data = dataLines.join('\n').trim()
  if (!data || data === '[DONE]') return null
  return data
}

export async function readJsonServerSentEvents(response: Response, onEvent: (event: Record<string, unknown>) => void | Promise<void>) {
  if (!response.body) throw new Error('接口未返回可读取的流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let hasDataLine = false

  const processBlock = async (block: string) => {
    if (block.split(/\r?\n/).some((line) => line.startsWith('data:'))) hasDataLine = true
    const data = parseEventBlock(block)
    if (!data) return

    let event: unknown
    try {
      event = JSON.parse(data)
    } catch {
      throw new Error(appendStreamingFormatHint(data))
    }
    if (!isRecord(event)) return

    const error = getStreamError(event)
    if (error) throw new Error(error)
    await onEvent(event)
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let separatorIdx = buffer.search(/\r?\n\r?\n/)
    while (separatorIdx >= 0) {
      const block = buffer.slice(0, separatorIdx)
      const separator = buffer.match(/\r?\n\r?\n/)?.[0] ?? '\n\n'
      buffer = buffer.slice(separatorIdx + separator.length)
      await processBlock(block)
      separatorIdx = buffer.search(/\r?\n\r?\n/)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) await processBlock(buffer)
  if (!hasDataLine) throw new Error(appendStreamingFormatHint('未从流式响应中解析到有效的 data 事件'))
}
