import { getSub2Token, refreshSub2Token } from '../../lib/sub2api'

export type VoiceOption = {
  name: string
  locale: string
  gender: 'Female' | 'Male'
  displayName: string
}

export type TtsInput = {
  text: string
  voice: string
  rate: number
  pitch: number
  volume: number
}

export type SubtitleSegment = {
  id: number
  start: number
  end: number
  text: string
}

export type TranscriptionJob = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  language?: string
  duration?: number
  segments?: SubtitleSegment[]
  error?: string
}

export class MediaApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message)
    this.name = 'MediaApiError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function mediaFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = getSub2Token()
  if (!token) throw new MediaApiError('请先登录 Sub2API', 401, 'UNAUTHORIZED')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`/cloud-api/media${path}`, { ...init, headers }).catch((err) => {
    if ((err as { name?: string }).name === 'AbortError') throw err
    throw new MediaApiError('Cloud Server 未启动或网络不可用', 0, 'NETWORK_ERROR')
  })
  if (res.status !== 401 || !retry) return res
  await refreshSub2Token(init.signal ?? undefined)
  return mediaFetch(path, init, false)
}

async function readError(res: Response): Promise<never> {
  let data: unknown
  try {
    data = await res.json()
  } catch {
    data = null
  }
  const error = isRecord(data) && isRecord(data.error) ? data.error : null
  const detail = isRecord(data) && typeof data.detail === 'string' ? data.detail : null
  const message = error && typeof error.message === 'string'
    ? error.message
    : detail
      ? detail
    : res.status === 500
      ? 'Cloud Server 未启动或代理连接失败'
      : `媒体请求失败 (${res.status})`
  const code = error && typeof error.code === 'string' ? error.code : undefined
  throw new MediaApiError(message, res.status, code)
}

async function readData(res: Response) {
  if (!res.ok) return readError(res)
  const data: unknown = await res.json()
  if (!isRecord(data) || !Object.prototype.hasOwnProperty.call(data, 'data')) {
    throw new MediaApiError('媒体接口返回格式无效', res.status)
  }
  return data.data
}

function isVoice(value: unknown): value is VoiceOption {
  if (!isRecord(value)) return false
  return typeof value.name === 'string'
    && typeof value.locale === 'string'
    && (value.gender === 'Female' || value.gender === 'Male')
    && typeof value.displayName === 'string'
}

function isSegment(value: unknown): value is SubtitleSegment {
  if (!isRecord(value)) return false
  return Number.isInteger(value.id)
    && typeof value.start === 'number'
    && typeof value.end === 'number'
    && typeof value.text === 'string'
}

function isJob(value: unknown): value is TranscriptionJob {
  if (!isRecord(value) || typeof value.id !== 'string') return false
  if (!['queued', 'running', 'succeeded', 'failed', 'canceled'].includes(String(value.status))) return false
  if (value.language !== undefined && typeof value.language !== 'string') return false
  if (value.duration !== undefined && typeof value.duration !== 'number') return false
  if (value.error !== undefined && typeof value.error !== 'string') return false
  return value.segments === undefined || (Array.isArray(value.segments) && value.segments.every(isSegment))
}

export async function listMediaVoices(signal?: AbortSignal) {
  const data = await readData(await mediaFetch('/voices', { signal }))
  if (!Array.isArray(data) || !data.every(isVoice)) throw new MediaApiError('音色列表格式无效', 200)
  return data
}

export async function createMediaSpeech(input: TtsInput, signal?: AbortSignal) {
  const res = await mediaFetch('/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })
  if (!res.ok) return readError(res)
  return res.blob()
}

export async function createMediaTranscription(file: Blob, name: string, language: string, signal?: AbortSignal) {
  const form = new FormData()
  if (language) form.append('language', language)
  form.append('file', file, name)
  const data = await readData(await mediaFetch('/transcriptions', { method: 'POST', body: form, signal }))
  if (!isJob(data)) throw new MediaApiError('字幕任务格式无效', 200)
  return data
}

export async function getMediaTranscription(id: string, signal?: AbortSignal) {
  const data = await readData(await mediaFetch(`/transcriptions/${encodeURIComponent(id)}`, { signal }))
  if (!isJob(data)) throw new MediaApiError('字幕任务格式无效', 200)
  return data
}

export async function cancelMediaTranscription(id: string, signal?: AbortSignal) {
  await readData(await mediaFetch(`/transcriptions/${encodeURIComponent(id)}`, { method: 'DELETE', signal }))
}
