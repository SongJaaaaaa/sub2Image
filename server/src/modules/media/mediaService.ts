import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

import type { QueryResultRow } from 'pg'

import type { TransactionalDb } from '../../database/database.js'
import { AppError } from '../../errors.js'
import type { SubtitleSegment, TranscriptionJob, TranscriptionJobStatus, VoiceOption } from '../../types.js'
import type { MediaWorker, TtsInput } from './mediaWorker.js'
import { MediaWorkerError } from './mediaWorker.js'

type JobRow = QueryResultRow & {
  id: string
  account_id: string
  status: TranscriptionJobStatus
  language: string | null
  detected_language: string | null
  duration: number | string | null
  result_json: SubtitleSegment[] | null
  error_code: string | null
  error_message: string | null
}

type VideoInput = {
  stream: NodeJS.ReadableStream & { truncated?: boolean }
  fileName: string
  mimeType: string
  language?: string
}

const LANGUAGES = new Set(['zh', 'en', 'ja', 'ko'])

export class MediaService {
  private voices: { items: VoiceOption[]; expiresAt: number } | null = null
  private running = false
  private closed = false

  constructor(
    private db: TransactionalDb,
    private worker: MediaWorker,
    private jobsDir: string,
    private jobTtl: number,
    private voiceCacheTtl: number,
    private maxTtsChars: number,
    private maxVideoSize: number,
    private maxVideoDuration: number,
    private allowedVideoTypes: string[]
  ) {}

  async start() {
    await mkdir(this.jobsDir, { recursive: true })
    await this.db.query(`
      UPDATE cloud_media_jobs
      SET status = 'queued', updated_at = now()
      WHERE status = 'running'
    `)
    await this.expire()
    await this.cleanupOrphans()
    this.wake()
  }

  close() {
    this.closed = true
  }

  async ensureAvailable() {
    try {
      await this.worker.health()
    } catch {
      throw new AppError(503, 'MEDIA_UNAVAILABLE', '字幕识别服务暂时不可用')
    }
  }

  async listVoices() {
    if (this.voices && this.voices.expiresAt > Date.now()) return this.voices.items
    try {
      const items = await this.worker.listVoices()
      this.voices = { items, expiresAt: Date.now() + this.voiceCacheTtl }
      return items
    } catch (err) {
      throw new AppError(503, 'MEDIA_UNAVAILABLE', err instanceof Error ? err.message : '音色服务不可用')
    }
  }

  async synthesize(input: TtsInput) {
    if (!input.text.trim() || input.text.length > this.maxTtsChars) {
      throw new AppError(400, 'INVALID_TTS_INPUT', `文字长度必须为 1-${this.maxTtsChars} 个字符`)
    }
    const voices = await this.listVoices()
    if (!voices.some((voice) => voice.name === input.voice)) {
      throw new AppError(400, 'INVALID_TTS_INPUT', '所选音色不存在')
    }
    try {
      return await this.worker.synthesize({ ...input, text: input.text.trim() })
    } catch (err) {
      if (err instanceof MediaWorkerError && err.status === 503) {
        throw new AppError(503, 'MEDIA_UNAVAILABLE', '音色服务暂时不可用')
      }
      throw new AppError(502, 'TTS_FAILED', '语音生成失败')
    }
  }

  async createTranscription(accountId: string, input: VideoInput) {
    if (!this.allowedVideoTypes.includes(input.mimeType)) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', '不支持该视频格式')
    }
    if (input.language && !LANGUAGES.has(input.language)) {
      throw new AppError(400, 'VALIDATION_ERROR', '识别语言无效')
    }

    const id = randomUUID()
    const dir = join(this.jobsDir, id)
    const name = basename(input.fileName || 'video').slice(0, 255)
    try {
      await this.db.query(`
        INSERT INTO cloud_media_jobs (
          id, account_id, status, input_name, input_mime, language, expires_at
        ) VALUES ($1, $2, 'queued', $3, $4, $5, $6)
      `, [id, accountId, name, input.mimeType, input.language ?? null, new Date(Date.now() + this.jobTtl)])
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError(409, 'TRANSCRIPTION_ACTIVE', '已有字幕识别任务正在处理')
      }
      throw err
    }

    try {
      await mkdir(dir, { recursive: false })
      await pipeline(input.stream, createWriteStream(join(dir, 'input'), { flags: 'wx' }))
      const size = (await stat(join(dir, 'input'))).size
      if (input.stream.truncated || size > this.maxVideoSize) {
        throw new AppError(413, 'FILE_TOO_LARGE', '视频文件超过允许大小')
      }
      if (!size) throw new AppError(400, 'FILE_BODY_REQUIRED', '视频文件为空')
      await this.db.query(`
        UPDATE cloud_media_jobs
        SET input_size = $3, input_ready = true, updated_at = now()
        WHERE account_id = $1 AND id = $2
      `, [accountId, id, size])
    } catch (err) {
      await this.db.query('DELETE FROM cloud_media_jobs WHERE account_id = $1 AND id = $2', [accountId, id])
      await rm(dir, { recursive: true, force: true })
      throw err
    }

    const job: TranscriptionJob = { id, status: 'queued' }
    this.wake()
    return job
  }

  async getTranscription(accountId: string, id: string) {
    const row = await this.find(accountId, id)
    if (!row) throw new AppError(404, 'TRANSCRIPTION_NOT_FOUND', '字幕识别任务不存在')
    return this.toPublic(row)
  }

  async cancelTranscription(accountId: string, id: string) {
    const row = await this.find(accountId, id)
    if (!row) return
    if (row.status !== 'queued' && row.status !== 'running') return

    await this.db.query(`
      UPDATE cloud_media_jobs
      SET status = 'canceled', updated_at = now()
      WHERE account_id = $1 AND id = $2 AND status IN ('queued', 'running')
    `, [accountId, id])
    if (row.status === 'running') {
      await writeFile(join(this.jobsDir, id, 'cancel'), '')
      return
    }
    await rm(join(this.jobsDir, id), { recursive: true, force: true })
  }

  async expire() {
    const result = await this.db.query<{ id: string }>(`
      DELETE FROM cloud_media_jobs
      WHERE expires_at <= now()
      RETURNING id
    `)
    await Promise.all(result.rows.map((row) => rm(join(this.jobsDir, row.id), { recursive: true, force: true })))
  }

  private async cleanupOrphans() {
    const result = await this.db.query<{ id: string }>('SELECT id FROM cloud_media_jobs')
    const ids = new Set(result.rows.map((row) => row.id))
    const entries = await readdir(this.jobsDir, { withFileTypes: true })
    await Promise.all(entries
      .filter((entry) => entry.isDirectory() && !ids.has(entry.name))
      .map((entry) => rm(join(this.jobsDir, entry.name), { recursive: true, force: true })))
  }

  private async find(accountId: string, id: string) {
    const result = await this.db.query<JobRow>(`
      SELECT id, account_id, status, language, detected_language, duration,
        result_json, error_code, error_message
      FROM cloud_media_jobs
      WHERE account_id = $1 AND id = $2
    `, [accountId, id])
    return result.rows[0] ?? null
  }

  private toPublic(row: JobRow): TranscriptionJob {
    return {
      id: row.id,
      status: row.status,
      ...(row.detected_language ? { language: row.detected_language } : {}),
      ...(row.duration !== null ? { duration: Number(row.duration) } : {}),
      ...(row.result_json ? { segments: row.result_json } : {}),
      ...(row.error_message ? { error: row.error_message } : {})
    }
  }

  private wake() {
    if (this.running || this.closed) return
    this.running = true
    void this.runQueue().catch((err) => {
      console.error('字幕识别队列失败', err)
    }).finally(() => {
      this.running = false
      if (!this.closed) setTimeout(() => this.wake(), 1000).unref()
    })
  }

  private async runQueue() {
    while (!this.closed) {
      const result = await this.db.query<JobRow>(`
        UPDATE cloud_media_jobs
        SET status = 'running', updated_at = now()
        WHERE id = (
          SELECT id FROM cloud_media_jobs
          WHERE status = 'queued' AND input_ready = true
          ORDER BY created_at
          LIMIT 1
        ) AND status = 'queued'
        RETURNING id, account_id, status, language, detected_language, duration,
          result_json, error_code, error_message
      `)
      const job = result.rows[0]
      if (!job) return
      await this.process(job)
    }
  }

  private async process(job: JobRow) {
    try {
      const result = await this.worker.transcribe(job.id, job.language ?? undefined)
      const current = await this.find(job.account_id, job.id)
      if (!current || current.status === 'canceled') return
      if (result.duration > this.maxVideoDuration) {
        await this.fail(job.id, 'VIDEO_TOO_LONG', '视频时长不能超过两小时')
        return
      }
      await this.db.query(`
        UPDATE cloud_media_jobs
        SET status = 'succeeded', detected_language = $2, duration = $3,
          result_json = $4, updated_at = now()
        WHERE id = $1 AND status = 'running'
      `, [job.id, result.language, result.duration, JSON.stringify(result.segments)])
    } catch (err) {
      const current = await this.find(job.account_id, job.id)
      if (current?.status !== 'canceled') {
        const code = err instanceof MediaWorkerError && err.status === 503
          ? 'MEDIA_UNAVAILABLE'
          : err instanceof MediaWorkerError && err.status === 413
            ? 'VIDEO_TOO_LONG'
            : 'TRANSCRIPTION_FAILED'
        const message = code === 'MEDIA_UNAVAILABLE'
          ? '字幕识别服务暂时不可用'
          : code === 'VIDEO_TOO_LONG'
            ? '视频时长不能超过两小时'
            : '字幕识别失败'
        await this.fail(job.id, code, message)
      }
    } finally {
      await rm(join(this.jobsDir, job.id), { recursive: true, force: true })
    }
  }

  private async fail(id: string, code: string, message: string) {
    await this.db.query(`
      UPDATE cloud_media_jobs
      SET status = 'failed', error_code = $2, error_message = $3, updated_at = now()
      WHERE id = $1 AND status = 'running'
    `, [id, code, message])
  }
}
