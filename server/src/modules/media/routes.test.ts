import { Readable } from 'node:stream'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { PoolClient, QueryResult, QueryResultRow } from 'pg'
import { newDb } from 'pg-mem'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { config } from '../../config.js'
import type { Db, TransactionalDb } from '../../database/database.js'
import { migrate } from '../../database/migrate.js'
import { AppError } from '../../errors.js'
import type { AuthProvider } from '../auth/authProvider.js'
import { MediaService } from './mediaService.js'
import { MediaWorkerError, type MediaWorker, type TtsInput, type WorkerTranscription } from './mediaWorker.js'
import { LocalStorageDriver } from '../../storage/localStorageDriver.js'

class TestDatabase implements TransactionalDb {
  constructor(private pool: { connect(): Promise<PoolClient>; query(sql: string, values?: unknown[]): Promise<QueryResult> }) {}

  query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
    return this.pool.query(sql, values) as Promise<QueryResult<R>>
  }

  async tx<T>(fn: (db: Db) => Promise<T>) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
}

class TestWorker implements MediaWorker {
  transcriptions = 0
  available = true
  hold = false
  private releasePending: (() => void) | null = null

  async health() {
    if (!this.available) throw new MediaWorkerError(503, 'unavailable')
  }

  async listVoices() {
    if (!this.available) throw new MediaWorkerError(503, 'unavailable')
    return [{ name: 'zh-CN-XiaoxiaoNeural', locale: 'zh-CN', gender: 'Female' as const, displayName: '晓晓' }]
  }

  async synthesize(input: TtsInput) {
    return Readable.from(Buffer.from(`mp3:${input.text}`))
  }

  async transcribe(): Promise<WorkerTranscription> {
    this.transcriptions += 1
    if (this.hold) await new Promise<void>((resolve) => { this.releasePending = resolve })
    if (!this.available) throw new MediaWorkerError(503, 'unavailable')
    return {
      language: 'zh',
      duration: 3.2,
      segments: [{ id: 0, start: 0, end: 3.2, text: '测试字幕' }]
    }
  }

  release() {
    this.hold = false
    this.releasePending?.()
    this.releasePending = null
  }
}

const auth: AuthProvider = {
  async verify(req) {
    const token = req.authorization?.slice(7)
    if (!token) throw new AppError(401, 'UNAUTHORIZED', '请先登录')
    return { id: token }
  }
}

function multipart(language = 'zh', content = 'video bytes') {
  const boundary = '----media-test-boundary'
  return {
    boundary,
    body: Buffer.from([
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.mp4"\r\nContent-Type: video/mp4\r\n\r\n`,
      `${content}\r\n`,
      `--${boundary}--\r\n`,
    ].join(''))
  }
}

describe('media routes', () => {
  let app: ReturnType<typeof buildApp>
  let db: TestDatabase
  let dir: string
  let jobsDir: string
  let worker: TestWorker

  beforeEach(async () => {
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    db = new TestDatabase(new adapter.Pool())
    await migrate(db)
    dir = await mkdtemp(join(tmpdir(), 'media-api-'))
    jobsDir = join(dir, 'jobs')
    worker = new TestWorker()
    app = buildApp({
      db,
      storage: new LocalStorageDriver(join(dir, 'cloud')),
      auth,
      mediaWorker: worker,
      mediaJobsDir: jobsDir,
      cfg: { ...config, maxVideoSize: 1024, cleanupInterval: 60 * 60 * 1000 }
    })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('lists voices and streams MP3', async () => {
    const headers = { authorization: 'Bearer user-a' }
    const voices = await app.inject({ method: 'GET', url: '/api/media/voices', headers })
    expect(voices.statusCode).toBe(200)
    expect(voices.json().data[0].name).toBe('zh-CN-XiaoxiaoNeural')

    const tts = await app.inject({
      method: 'POST',
      url: '/api/media/tts',
      headers,
      payload: { text: '你好', voice: 'zh-CN-XiaoxiaoNeural', rate: 0, pitch: 0, volume: 0 }
    })
    expect(tts.statusCode).toBe(200)
    expect(tts.headers['content-type']).toContain('audio/mpeg')
    expect(tts.body).toBe('mp3:你好')
  })

  it('requires authentication and validates TTS input', async () => {
    const unauthorized = await app.inject({ method: 'GET', url: '/api/media/voices' })
    expect(unauthorized.statusCode).toBe(401)

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/media/tts',
      headers: { authorization: 'Bearer user-a' },
      payload: { text: '', voice: 'missing', rate: 0, pitch: 0, volume: 0 }
    })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 503 before accepting a video when the Worker is unavailable', async () => {
    worker.available = false
    const data = multipart()
    const res = await app.inject({
      method: 'POST',
      url: '/api/media/transcriptions',
      headers: {
        authorization: 'Bearer user-a',
        'content-type': `multipart/form-data; boundary=${data.boundary}`
      },
      payload: data.body
    })
    expect(res.statusCode).toBe(503)
    expect(res.json().error.code).toBe('MEDIA_UNAVAILABLE')
  })

  it('rejects oversized uploads', async () => {
    const data = multipart('zh', 'x'.repeat(1400))
    const res = await app.inject({
      method: 'POST',
      url: '/api/media/transcriptions',
      headers: {
        authorization: 'Bearer user-a',
        'content-type': `multipart/form-data; boundary=${data.boundary}`
      },
      payload: data.body
    })
    expect(res.statusCode).toBe(413)
  })

  it('allows only one active transcription per account and supports cancellation', async () => {
    worker.hold = true
    const first = multipart()
    const created = await app.inject({
      method: 'POST',
      url: '/api/media/transcriptions',
      headers: {
        authorization: 'Bearer user-a',
        'content-type': `multipart/form-data; boundary=${first.boundary}`
      },
      payload: first.body
    })
    expect(created.statusCode).toBe(202)
    const id = created.json().data.id

    const second = multipart()
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/media/transcriptions',
      headers: {
        authorization: 'Bearer user-a',
        'content-type': `multipart/form-data; boundary=${second.boundary}`
      },
      payload: second.body
    })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().error.code).toBe('TRANSCRIPTION_ACTIVE')

    const canceled = await app.inject({
      method: 'DELETE',
      url: `/api/media/transcriptions/${id}`,
      headers: { authorization: 'Bearer user-a' }
    })
    expect(canceled.statusCode).toBe(200)
    const status = await app.inject({
      method: 'GET',
      url: `/api/media/transcriptions/${id}`,
      headers: { authorization: 'Bearer user-a' }
    })
    expect(status.json().data.status).toBe('canceled')
    worker.release()
  })

  it('creates, completes and isolates a transcription job', async () => {
    const data = multipart()
    const created = await app.inject({
      method: 'POST',
      url: '/api/media/transcriptions',
      headers: {
        authorization: 'Bearer user-a',
        'content-type': `multipart/form-data; boundary=${data.boundary}`
      },
      payload: data.body
    })
    expect(created.statusCode, created.body).toBe(202)
    const id = created.json().data.id

    let job: { status: string; segments?: Array<{ text: string }> } | undefined
    for (let idx = 0; idx < 20; idx += 1) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/media/transcriptions/${id}`,
        headers: { authorization: 'Bearer user-a' }
      })
      job = res.json().data
      if (job?.status === 'succeeded') break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(job?.status).toBe('succeeded')
    expect(job?.segments?.[0]?.text).toBe('测试字幕')
    expect(worker.transcriptions).toBe(1)

    const other = await app.inject({
      method: 'GET',
      url: `/api/media/transcriptions/${id}`,
      headers: { authorization: 'Bearer user-b' }
    })
    expect(other.statusCode).toBe(404)
    expect(other.json().error.code).toBe('TRANSCRIPTION_NOT_FOUND')
  })

  it('removes expired task records and scratch directories', async () => {
    const data = multipart()
    const created = await app.inject({
      method: 'POST',
      url: '/api/media/transcriptions',
      headers: {
        authorization: 'Bearer user-a',
        'content-type': `multipart/form-data; boundary=${data.boundary}`
      },
      payload: data.body
    })
    const id = created.json().data.id
    for (let idx = 0; idx < 20; idx += 1) {
      const current = await app.inject({
        method: 'GET',
        url: `/api/media/transcriptions/${id}`,
        headers: { authorization: 'Bearer user-a' }
      })
      if (current.json().data.status === 'succeeded') break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    const scratch = join(jobsDir, id)
    await mkdir(scratch, { recursive: true })
    await writeFile(join(scratch, 'stale'), 'stale')
    await db.query('UPDATE cloud_media_jobs SET expires_at = $2 WHERE id = $1', [id, new Date(0)])
    const media = new MediaService(
      db,
      worker,
      jobsDir,
      config.mediaJobTtl,
      config.voiceCacheTtl,
      config.maxTtsChars,
      config.maxVideoSize,
      config.maxVideoDuration,
      config.allowedVideoTypes
    )
    await media.expire()

    const expired = await app.inject({
      method: 'GET',
      url: `/api/media/transcriptions/${id}`,
      headers: { authorization: 'Bearer user-a' }
    })
    expect(expired.statusCode).toBe(404)
    await expect(stat(scratch)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
