import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'

import type { SubtitleSegment, VoiceOption } from '../../types.js'

export type TtsInput = {
  text: string
  voice: string
  rate: number
  pitch: number
  volume: number
}

export type WorkerTranscription = {
  language: string
  duration: number
  segments: SubtitleSegment[]
}

export interface MediaWorker {
  health(): Promise<void>
  listVoices(): Promise<VoiceOption[]>
  synthesize(input: TtsInput): Promise<Readable>
  transcribe(id: string, language?: string): Promise<WorkerTranscription>
}

export class MediaWorkerError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function isVoice(value: unknown): value is VoiceOption {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.name === 'string'
    && typeof item.locale === 'string'
    && (item.gender === 'Female' || item.gender === 'Male')
    && typeof item.displayName === 'string'
}

function isTranscription(value: unknown): value is WorkerTranscription {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.language !== 'string' || typeof item.duration !== 'number' || !Array.isArray(item.segments)) return false
  return item.segments.every((segment) => {
    if (!segment || typeof segment !== 'object') return false
    const row = segment as Record<string, unknown>
    return Number.isInteger(row.id)
      && typeof row.start === 'number'
      && typeof row.end === 'number'
      && typeof row.text === 'string'
  })
}

export class SpeechWorkerClient implements MediaWorker {
  constructor(private baseUrl: string) {}

  private async request(path: string, init?: RequestInit) {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, init)
      if (!res.ok) throw new MediaWorkerError(res.status, `Speech Worker 请求失败 (${res.status})`)
      return res
    } catch (err) {
      if (err instanceof MediaWorkerError) throw err
      throw new MediaWorkerError(503, 'Speech Worker 不可用')
    }
  }

  async health() {
    await this.request('/health')
  }

  async listVoices() {
    const data: unknown = await (await this.request('/voices')).json()
    if (!Array.isArray(data) || !data.every(isVoice)) throw new MediaWorkerError(502, 'Speech Worker 音色格式无效')
    return data
  }

  async synthesize(input: TtsInput) {
    const res = await this.request('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    })
    if (!res.body) throw new MediaWorkerError(502, 'Speech Worker 未返回音频')
    return Readable.fromWeb(res.body as ReadableStream<Uint8Array>)
  }

  async transcribe(id: string, language?: string) {
    const res = await this.request('/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: id, language })
    })
    const data: unknown = await res.json()
    if (!isTranscription(data)) throw new MediaWorkerError(502, 'Speech Worker 字幕格式无效')
    return data
  }
}
