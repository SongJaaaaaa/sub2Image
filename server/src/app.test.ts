import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { PoolClient, QueryResult, QueryResultRow } from 'pg'
import { newDb } from 'pg-mem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from './app.js'
import { config } from './config.js'
import type { Db, TransactionalDb } from './database/database.js'
import { migrate } from './database/migrate.js'
import { AppError } from './errors.js'
import type { AuthProvider } from './modules/auth/authProvider.js'
import { AssetService } from './modules/assets/assetService.js'
import { StorageCleanupService } from './storage/storageCleanupService.js'
import { LocalStorageDriver } from './storage/localStorageDriver.js'
import type { AssetKind } from './types.js'

class TestDatabase implements TransactionalDb {
  activeTransactions = 0
  failNextQuery = false
  queries: string[] = []
  private pause: {
    text: string
    reached: () => void
    wait: Promise<void>
  } | null = null

  constructor(private pool: { connect(): Promise<PoolClient>; query(sql: string, values?: unknown[]): Promise<QueryResult> }) {}

  async query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
    this.queries.push(sql)
    if (this.failNextQuery) {
      this.failNextQuery = false
      throw new Error('测试数据库查询失败')
    }
    const result = await this.pool.query(sql, values) as QueryResult<R>
    if (this.pause && sql.includes(this.pause.text)) {
      const pause = this.pause
      this.pause = null
      pause.reached()
      await pause.wait
    }
    return result
  }

  pauseAfterQuery(text: string) {
    let reached = () => undefined
    let release = () => undefined
    const started = new Promise<void>((resolve) => { reached = resolve })
    const wait = new Promise<void>((resolve) => { release = resolve })
    this.pause = { text, reached, wait }
    return { started, release }
  }

  async tx<T>(fn: (db: Db) => Promise<T>) {
    const client = await this.pool.connect()
    const query = client.query.bind(client) as Db['query']
    const owner = this
    const db: Db = {
      query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
        owner.queries.push(sql)
        return query<R>(sql, values)
      }
    }
    let active = false
    try {
      await client.query('BEGIN')
      this.activeTransactions += 1
      active = true
      const result = await fn(db)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      if (active) this.activeTransactions -= 1
      client.release()
    }
  }
}

class TestStorage extends LocalStorageDriver {
  failNextDelete = false

  async delete(key: string) {
    if (this.failNextDelete) {
      this.failNextDelete = false
      throw new Error('测试文件删除失败')
    }
    await super.delete(key)
  }
}

const authIps: string[] = []

const auth: AuthProvider = {
  async verify(req) {
    authIps.push(req.ip)
    const token = req.authorization?.slice(7)
    if (!token) throw new AppError(401, 'UNAUTHORIZED', '请先登录')
    return { id: token, email: `${token}@example.com` }
  }
}

const testConfig = {
  ...config,
  quotaBytes: 8 * 1024 * 1024,
  maxMetadataSize: config.maxTaskSize + config.maxSkillSize,
  maxTaskCount: 2,
  maxSkillCount: 2,
  maxUploadCount: 2,
  maxAssetCount: 3
}

describe('cloud API', () => {
  let app: ReturnType<typeof buildApp>
  let dir: string
  let db: TestDatabase
  let storage: TestStorage

  beforeEach(async () => {
    authIps.length = 0
    const mem = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = mem.adapters.createPg()
    db = new TestDatabase(new adapter.Pool())
    await migrate(db)
    dir = await mkdtemp(join(tmpdir(), 'cloud-api-'))
    storage = new TestStorage(dir)
    app = buildApp({
      db,
      storage,
      auth,
      cfg: testConfig,
      mediaJobsDir: join(dir, 'media-jobs')
    })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  })

  async function putUpload(assetId: string, file: Buffer, kind: AssetKind = 'image', token = 'user-a') {
    const headers = { authorization: `Bearer ${token}` }
    const sha256 = createHash('sha256').update(file).digest('hex')
    const mimeType = kind === 'image' ? 'image/png' : 'video/mp4'
    const created = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers,
      payload: {
        assetId,
        kind,
        mimeType,
        size: file.length,
        sha256,
        metadata: { width: 1, height: 1 }
      }
    })
    expect(created.statusCode).toBe(200)
    const upload = created.json<{ data: { id: string; status: string } }>().data
    expect(upload.status).toBe('pending')

    const content = await app.inject({
      method: 'PUT',
      url: `/api/uploads/${upload.id}/content`,
      headers: {
        ...headers,
        'content-type': mimeType,
        'content-length': String(file.length)
      },
      payload: file
    })
    expect(content.statusCode).toBe(200)
    expect(content.json().data.status).toBe('uploaded')

    return { id: upload.id, headers }
  }

  async function uploadAsset(assetId: string, file: Buffer, kind: AssetKind = 'image', token = 'user-a') {
    const upload = await putUpload(assetId, file, kind, token)

    const completed = await app.inject({
      method: 'POST',
      url: `/api/uploads/${upload.id}/complete`,
      headers: upload.headers
    })
    expect(completed.statusCode).toBe(200)
    return completed.json<{ data: { id: string; assetId: string; contentUrl: string } }>().data
  }

  it('完成上传、任务、Skill、同步、隔离和引用删除闭环', async () => {
    const file = Buffer.from('test image bytes')
    const headers = { authorization: 'Bearer user-a' }

    const health = await app.inject({ method: 'GET', url: '/health' })
    expect(health.statusCode).toBe(200)

    const asset = await uploadAsset('local-image-1', file)
    expect(asset.assetId).toBe('local-image-1')
    expect(asset.contentUrl).toBe(`/cloud-api/assets/${asset.id}/content`)

    const uploadRetry = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers,
      payload: {
        assetId: 'local-image-1',
        kind: 'image',
        mimeType: 'image/png',
        size: file.length,
        sha256: createHash('sha256').update(file).digest('hex')
      }
    })
    expect(uploadRetry.json().data.status).toBe('complete')
    expect(uploadRetry.json().data.asset.id).toBe(asset.id)

    const mismatch = await app.inject({
      method: 'PUT',
      url: '/api/tasks/task-1',
      headers,
      payload: { task: { id: 'other-task' }, assets: [] }
    })
    expect(mismatch.statusCode).toBe(400)
    expect(mismatch.json().error.code).toBe('TASK_ID_MISMATCH')

    const task = await app.inject({
      method: 'PUT',
      url: '/api/tasks/task-1',
      headers,
      payload: {
        task: { id: 'task-1', prompt: '测试', apiKey: 'must-not-store' },
        assets: [{ assetId: 'local-image-1', role: 'output', index: 0 }]
      }
    })
    expect(task.statusCode).toBe(200)
    expect(task.json().data.task).toEqual({ id: 'task-1', prompt: '测试' })

    const secondTask = await app.inject({
      method: 'PUT',
      url: '/api/tasks/task-2',
      headers,
      payload: {
        task: { id: 'task-2', prompt: '共享资源' },
        assets: [{ assetId: 'local-image-1', role: 'input', index: 0 }]
      }
    })
    expect(secondTask.statusCode).toBe(200)

    const updatedTask = await app.inject({
      method: 'PUT',
      url: '/api/tasks/task-1',
      headers,
      payload: { task: { id: 'task-1', prompt: '已更新' }, assets: [] }
    })
    expect(updatedTask.statusCode).toBe(200)

    const taskLimit = await app.inject({
      method: 'PUT',
      url: '/api/tasks/task-3',
      headers,
      payload: { task: { id: 'task-3' }, assets: [] }
    })
    expect(taskLimit.statusCode).toBe(413)
    expect(taskLimit.json().error.code).toBe('TASK_LIMIT_EXCEEDED')

    const skill = await app.inject({
      method: 'PUT',
      url: '/api/skills/my-skill',
      headers,
      payload: { version: 1, fileName: 'SKILL.md', markdown: '# 测试\n\n内容' }
    })
    expect(skill.statusCode).toBe(200)
    const skillRetry = await app.inject({
      method: 'PUT',
      url: '/api/skills/my-skill',
      headers,
      payload: { version: 2, fileName: 'SKILL.md', markdown: '# 测试\n\n更新' }
    })
    expect(skillRetry.json().data.version).toBe(2)

    const bootstrap = await app.inject({ method: 'GET', url: '/api/sync/bootstrap', headers })
    const synced = bootstrap.json<{ data: { tasks: unknown[]; skills: unknown[] } }>().data
    expect(synced.tasks).toHaveLength(2)
    expect(synced.skills).toHaveLength(1)

    const other = await app.inject({
      method: 'GET',
      url: '/api/sync/bootstrap',
      headers: { authorization: 'Bearer user-b' }
    })
    expect(other.json().data.tasks).toEqual([])
    expect(other.json().data.skills).toEqual([])

    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/assets/${asset.id}/content`,
      headers: { authorization: 'Bearer user-b' }
    })
    expect(forbidden.statusCode).toBe(404)

    const inUse = await app.inject({ method: 'DELETE', url: `/api/assets/${asset.id}`, headers })
    expect(inUse.statusCode).toBe(409)
    expect(inUse.json().error.code).toBe('ASSET_IN_USE')

    expect((await app.inject({ method: 'DELETE', url: '/api/tasks/task-1', headers })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/assets/${asset.id}/content`, headers })).statusCode).toBe(200)
    expect((await app.inject({ method: 'DELETE', url: '/api/tasks/task-2', headers })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/assets/${asset.id}/content`, headers })).statusCode).toBe(404)

    const account = await app.inject({ method: 'GET', url: '/api/account', headers })
    expect(account.json().data.usedBytes).toBe(0)
  })

  it('只信任直接代理一跳，不采用 XFF 左侧伪造地址', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/account',
      headers: {
        authorization: 'Bearer proxy-user',
        'x-forwarded-for': '198.51.100.10, 203.0.113.20'
      }
    })
    expect(res.statusCode).toBe(200)
    expect(authIps.at(-1)).toBe('203.0.113.20')
  })

  it('上传路由允许超过 JSON 全局上限的流式文件', async () => {
    const file = Buffer.alloc(config.maxTaskSize + 1, 1)
    const asset = await uploadAsset('large-image', file)
    expect(asset.assetId).toBe('large-image')
  })

  it('文件删除失败时先提交元数据删除并保留重试记录', async () => {
    const headers = { authorization: 'Bearer user-a' }
    const asset = await uploadAsset('cleanup-image', Buffer.from('cleanup'))
    storage.failNextDelete = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const deleted = await app.inject({ method: 'DELETE', url: `/api/assets/${asset.id}`, headers })
    expect(deleted.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/assets/${asset.id}/content`, headers })).statusCode).toBe(404)

    const pending = await db.query<{ object_key: string }>('SELECT object_key FROM cloud_storage_deletions')
    expect(pending.rows).toHaveLength(1)
    expect(await storage.exists(pending.rows[0]!.object_key)).toBe(true)
    expect((await app.inject({ method: 'GET', url: '/api/account', headers })).json().data.usedBytes).toBe(0)

    const replacement = await uploadAsset('cleanup-image', Buffer.from('cleanup'))
    await new StorageCleanupService(
      db,
      storage,
      (key, tx) => new AssetService(db).hasObjectKey(key, tx)
    ).flush()
    expect((await db.query('SELECT 1 FROM cloud_storage_deletions')).rowCount).toBe(0)
    expect(await storage.exists(pending.rows[0]!.object_key)).toBe(true)
    const content = await app.inject({
      method: 'GET',
      url: `/api/assets/${replacement.id}/content`,
      headers
    })
    expect(content.statusCode).toBe(200)
    expect(content.rawPayload).toEqual(Buffer.from('cleanup'))
    warn.mockRestore()
  })

  it('拒绝超过 256KB 的 Skill', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/skills/large-skill',
      headers: { authorization: 'Bearer user-a' },
      payload: {
        version: 1,
        fileName: 'SKILL.md',
        markdown: 'x'.repeat(256 * 1024 + 1)
      }
    })
    expect(res.statusCode).toBe(413)
    expect(res.json().error.code).toBe('SKILL_TOO_LARGE')
  })

  it('允许刚好达到字段上限并限制账号元数据总量', async () => {
    const headers = { authorization: 'Bearer limit-user' }
    const id = 'limit-task'
    const empty = { id, prompt: '' }
    const prompt = 'x'.repeat(config.maxTaskSize - Buffer.byteLength(JSON.stringify(empty), 'utf8'))
    const task = { id, prompt }
    expect(Buffer.byteLength(JSON.stringify(task), 'utf8')).toBe(config.maxTaskSize)

    const savedTask = await app.inject({
      method: 'PUT',
      url: `/api/tasks/${id}`,
      headers,
      payload: { task, assets: [] }
    })
    expect(savedTask.statusCode).toBe(200)

    const savedSkill = await app.inject({
      method: 'PUT',
      url: '/api/skills/limit-skill',
      headers,
      payload: {
        version: 1,
        fileName: 'SKILL.md',
        markdown: 'x'.repeat(config.maxSkillSize)
      }
    })
    expect(savedSkill.statusCode).toBe(200)

    const exceeded = await app.inject({
      method: 'PUT',
      url: '/api/skills/extra-skill',
      headers,
      payload: { version: 1, fileName: 'SKILL.md', markdown: 'x' }
    })
    expect(exceeded.statusCode).toBe(413)
    expect(exceeded.json().error.code).toBe('METADATA_QUOTA_EXCEEDED')
  })

  it('限制 Skill 数量并拒绝视频占用图片 role', async () => {
    const skillHeaders = { authorization: 'Bearer skill-count-user' }
    for (const id of ['skill-one', 'skill-two']) {
      const saved = await app.inject({
        method: 'PUT',
        url: `/api/skills/${id}`,
        headers: skillHeaders,
        payload: { version: 1, fileName: 'SKILL.md', markdown: id }
      })
      expect(saved.statusCode).toBe(200)
    }
    const tooMany = await app.inject({
      method: 'PUT',
      url: '/api/skills/skill-three',
      headers: skillHeaders,
      payload: { version: 1, fileName: 'SKILL.md', markdown: 'three' }
    })
    expect(tooMany.statusCode).toBe(413)
    expect(tooMany.json().error.code).toBe('SKILL_LIMIT_EXCEEDED')

    const video = await uploadAsset('role-video', Buffer.from('video bytes'), 'video')
    expect(video.assetId).toBe('role-video')
    const wrongRole = await app.inject({
      method: 'PUT',
      url: '/api/tasks/video-as-output',
      headers: { authorization: 'Bearer user-a' },
      payload: {
        task: { id: 'video-as-output' },
        assets: [{ assetId: 'role-video', role: 'output', index: 0 }]
      }
    })
    expect(wrongRole.statusCode).toBe(400)
    expect(wrongRole.json().error.code).toBe('INVALID_ASSET_KIND')
  })

  it('保留 Fastify 的非法 JSON、未知类型和 body limit 状态码', async () => {
    const headers = { authorization: 'Bearer request-errors' }
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: '{"assetId":'
    })
    expect(malformed.statusCode).toBe(400)
    expect(malformed.json().error.code).toBe('BAD_REQUEST')

    const unsupported = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: { ...headers, 'content-type': 'application/xml' },
      payload: '<upload />'
    })
    expect(unsupported.statusCode).toBe(415)
    expect(unsupported.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE')

    const tooLarge = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: JSON.stringify({ value: 'x'.repeat(config.maxTaskSize + 1) })
    })
    expect(tooLarge.statusCode).toBe(413)
    expect(tooLarge.json().error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('健康检查真实探测数据库', async () => {
    db.failNextQuery = true
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(500)
    expect(res.json().error.code).toBe('INTERNAL_ERROR')
  })

  it('在 PostgreSQL 前拒绝非法 UUID，并限制资源 metadata 字段', async () => {
    const headers = { authorization: 'Bearer input-boundaries' }
    for (const request of [
      { method: 'GET' as const, url: '/api/assets/not-a-uuid/content' },
      { method: 'DELETE' as const, url: '/api/assets/not-a-uuid' },
      { method: 'POST' as const, url: '/api/uploads/not-a-uuid/complete' },
      { method: 'DELETE' as const, url: '/api/uploads/not-a-uuid' }
    ]) {
      const res = await app.inject({ ...request, headers })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION_ERROR')
    }

    const badMetadata = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers,
      payload: {
        assetId: 'metadata-extra',
        kind: 'image',
        mimeType: 'image/png',
        size: 1,
        sha256: 'a'.repeat(64),
        metadata: { width: 1, privateBlob: 'x' }
      }
    })
    expect(badMetadata.statusCode).toBe(200)
    const metadataRow = await db.query<{ metadata: Record<string, unknown> }>(`
      SELECT metadata FROM cloud_uploads WHERE source_asset_id = 'metadata-extra'
    `)
    expect(metadataRow.rows[0]!.metadata).toEqual({ width: 1 })

    const longSource = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers,
      payload: {
        assetId: 'metadata-long-source',
        kind: 'image',
        mimeType: 'image/png',
        size: 1,
        sha256: 'b'.repeat(64),
        metadata: { sourceId: 'x'.repeat(301) }
      }
    })
    expect(longSource.statusCode).toBe(400)
  })

  it('拒绝超过 PostgreSQL integer 上限的任务资源位置和 Skill 版本', async () => {
    const headers = { authorization: 'Bearer integer-boundaries' }
    const task = await app.inject({
      method: 'PUT',
      url: '/api/tasks/integer-task',
      headers,
      payload: {
        task: { id: 'integer-task' },
        assets: [{ assetId: 'integer-asset', role: 'output', index: 2147483648 }]
      }
    })
    expect(task.statusCode).toBe(400)
    expect(task.json().error.code).toBe('VALIDATION_ERROR')

    const skill = await app.inject({
      method: 'PUT',
      url: '/api/skills/integer-skill',
      headers,
      payload: {
        version: 2147483648,
        fileName: 'SKILL.md',
        markdown: '# integer'
      }
    })
    expect(skill.statusCode).toBe(400)
    expect(skill.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('取消和完成的临时文件删除失败时保留 outbox', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const canceled = await putUpload('cancel-outbox', Buffer.from('cancel temp'), 'image', 'cancel-user')
      const cancelRow = await db.query<{ temp_object_key: string }>(`
        SELECT temp_object_key FROM cloud_uploads WHERE id = $1
      `, [canceled.id])
      storage.failNextDelete = true
      const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/uploads/${canceled.id}`,
        headers: canceled.headers
      })
      expect(deleted.statusCode).toBe(200)
      expect((await db.query('SELECT 1 FROM cloud_uploads WHERE id = $1', [canceled.id])).rowCount).toBe(0)
      expect((await db.query('SELECT 1 FROM cloud_storage_deletions WHERE object_key = $1', [cancelRow.rows[0]!.temp_object_key])).rowCount).toBe(1)
      expect(await storage.exists(cancelRow.rows[0]!.temp_object_key)).toBe(true)

      const completed = await putUpload('complete-outbox', Buffer.from('complete temp'), 'image', 'complete-user')
      const completeRow = await db.query<{ temp_object_key: string }>(`
        SELECT temp_object_key FROM cloud_uploads WHERE id = $1
      `, [completed.id])
      storage.failNextDelete = true
      const saved = await app.inject({
        method: 'POST',
        url: `/api/uploads/${completed.id}/complete`,
        headers: completed.headers
      })
      expect(saved.statusCode).toBe(200)
      expect((await db.query('SELECT 1 FROM cloud_storage_deletions WHERE object_key = $1', [completeRow.rows[0]!.temp_object_key])).rowCount).toBe(1)
      expect(await storage.exists(completeRow.rows[0]!.temp_object_key)).toBe(true)

      const assetId = saved.json<{ data: { id: string } }>().data.id
      const content = await app.inject({
        method: 'GET',
        url: `/api/assets/${assetId}/content`,
        headers: completed.headers
      })
      expect(content.statusCode).toBe(200)
      expect(content.headers['x-content-type-options']).toBe('nosniff')
      expect(content.rawPayload).toEqual(Buffer.from('complete temp'))
    } finally {
      warn.mockRestore()
    }
  })

  it('启动维护回收超过固定 TTL 的 uploaded 上传和临时文件', async () => {
    const upload = await putUpload('stale-upload', Buffer.from('stale file'), 'image', 'stale-user')
    const row = await db.query<{ temp_object_key: string }>(`
      SELECT temp_object_key FROM cloud_uploads WHERE id = $1
    `, [upload.id])
    const key = row.rows[0]!.temp_object_key
    await db.query('UPDATE cloud_uploads SET updated_at = $1 WHERE id = $2', [
      new Date(Date.now() - testConfig.uploadTtl - 1000),
      upload.id
    ])

    await app.close()
    app = buildApp({ db, storage, auth, cfg: testConfig, mediaJobsDir: join(dir, 'media-jobs') })
    await app.ready()

    expect((await db.query('SELECT 1 FROM cloud_uploads WHERE id = $1', [upload.id])).rowCount).toBe(0)
    expect(await storage.exists(key)).toBe(false)
    expect((await db.query('SELECT 1 FROM cloud_storage_deletions WHERE object_key = $1', [key])).rowCount).toBe(0)
  })

  it('大文件 PUT 和 complete 的存储 I/O 期间不占数据库事务，active claim 不能取消', async () => {
    const file = Buffer.from('blocked storage')
    const headers = { authorization: 'Bearer slow-user' }
    const created = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers,
      payload: {
        assetId: 'slow-file',
        kind: 'image',
        mimeType: 'image/png',
        size: file.length,
        sha256: createHash('sha256').update(file).digest('hex')
      }
    })
    const id = created.json<{ data: { id: string } }>().data.id
    const originalPut = storage.put.bind(storage)
    const putSpy = vi.spyOn(storage, 'put')

    let markPut = () => undefined
    let releasePut = () => undefined
    const putStarted = new Promise<void>((resolve) => { markPut = resolve })
    const putWait = new Promise<void>((resolve) => { releasePut = resolve })
    putSpy.mockImplementationOnce(async (input) => {
      markPut()
      await putWait
      return originalPut(input)
    })

    const uploading = app.inject({
      method: 'PUT',
      url: `/api/uploads/${id}/content`,
      headers: {
        ...headers,
        'content-type': 'image/png',
        'content-length': String(file.length)
      },
      payload: file
    })
    await putStarted
    expect(db.activeTransactions).toBe(0)
    const activeCancel = await app.inject({ method: 'DELETE', url: `/api/uploads/${id}`, headers })
    expect(activeCancel.statusCode).toBe(409)
    expect(activeCancel.json().error.code).toBe('UPLOAD_IN_PROGRESS')
    expect((await db.query('SELECT status FROM cloud_uploads WHERE id = $1', [id])).rows[0]).toMatchObject({ status: 'uploading' })
    expect((await db.query('SELECT 1 FROM cloud_storage_deletions')).rowCount).toBe(0)
    releasePut()
    expect((await uploading).statusCode).toBe(200)

    let markComplete = () => undefined
    let releaseComplete = () => undefined
    const completeStarted = new Promise<void>((resolve) => { markComplete = resolve })
    const completeWait = new Promise<void>((resolve) => { releaseComplete = resolve })
    putSpy.mockImplementationOnce(async (input) => {
      markComplete()
      await completeWait
      return originalPut(input)
    })

    const completing = app.inject({ method: 'POST', url: `/api/uploads/${id}/complete`, headers })
    await completeStarted
    expect(db.activeTransactions).toBe(0)
    const completeCancel = await app.inject({ method: 'DELETE', url: `/api/uploads/${id}`, headers })
    expect(completeCancel.statusCode).toBe(409)
    expect((await db.query('SELECT status FROM cloud_uploads WHERE id = $1', [id])).rows[0]).toMatchObject({ status: 'completing' })
    releaseComplete()
    expect((await completing).statusCode).toBe(200)
    putSpy.mockRestore()
  })

  it('complete 最终提交先锁账号再锁上传行', async () => {
    const upload = await putUpload('quota-lock-order', Buffer.from('quota lock'), 'image', 'quota-lock-user')
    db.queries.length = 0

    const completed = await app.inject({
      method: 'POST',
      url: `/api/uploads/${upload.id}/complete`,
      headers: upload.headers
    })
    expect(completed.statusCode).toBe(200)

    const sql = db.queries.map((query) => query.replace(/\s+/g, ' ').trim())
    const claimIdx = sql.findIndex((query) => query.includes("UPDATE cloud_uploads SET status = 'completing'"))
    const accountIdx = sql.findIndex((query, idx) => idx > claimIdx &&
      query.includes('SELECT * FROM cloud_accounts') && query.includes('FOR UPDATE'))
    const uploadIdx = sql.findIndex((query, idx) => idx > claimIdx &&
      query.includes('SELECT * FROM cloud_uploads') && query.includes('FOR UPDATE'))
    expect(claimIdx).toBeGreaterThanOrEqual(0)
    expect(accountIdx).toBeGreaterThan(claimIdx)
    expect(uploadIdx).toBeGreaterThan(accountIdx)
  })

  it('限制账号未完成上传和逻辑资源总数', async () => {
    const createPending = (assetId: string, token: string) => app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        assetId,
        kind: 'image',
        mimeType: 'image/png',
        size: 1,
        sha256: createHash('sha256').update(assetId).digest('hex')
      }
    })

    expect((await createPending('pending-one', 'pending-limit')).statusCode).toBe(200)
    expect((await createPending('pending-two', 'pending-limit')).statusCode).toBe(200)
    const tooManyUploads = await createPending('pending-three', 'pending-limit')
    expect(tooManyUploads.statusCode).toBe(413)
    expect(tooManyUploads.json().error.code).toBe('UPLOAD_LIMIT_EXCEEDED')

    for (const id of ['asset-one', 'asset-two', 'asset-three']) {
      expect((await uploadAsset(id, Buffer.from(id), 'image', 'asset-limit')).assetId).toBe(id)
    }
    const tooManyAssets = await createPending('asset-four', 'asset-limit')
    expect(tooManyAssets.statusCode).toBe(413)
    expect(tooManyAssets.json().error.code).toBe('ASSET_LIMIT_EXCEEDED')
  })

  it('DELETE 在首次提交后丢失响应时可安全重试', async () => {
    const headers = { authorization: 'Bearer delete-retry' }
    const pending = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers,
      payload: {
        assetId: 'delete-pending',
        kind: 'image',
        mimeType: 'image/png',
        size: 1,
        sha256: 'c'.repeat(64)
      }
    })
    const uploadId = pending.json<{ data: { id: string } }>().data.id
    for (let idx = 0; idx < 2; idx += 1) {
      expect((await app.inject({ method: 'DELETE', url: `/api/uploads/${uploadId}`, headers })).statusCode).toBe(200)
    }

    const asset = await uploadAsset('delete-asset', Buffer.from('delete asset'), 'image', 'delete-retry')
    for (let idx = 0; idx < 2; idx += 1) {
      expect((await app.inject({ method: 'DELETE', url: `/api/assets/${asset.id}`, headers })).statusCode).toBe(200)
    }

    expect((await app.inject({
      method: 'PUT',
      url: '/api/tasks/delete-task',
      headers,
      payload: { task: { id: 'delete-task' }, assets: [] }
    })).statusCode).toBe(200)
    expect((await app.inject({
      method: 'PUT',
      url: '/api/skills/delete-skill',
      headers,
      payload: { version: 1, fileName: 'SKILL.md', markdown: '# delete' }
    })).statusCode).toBe(200)
    for (let idx = 0; idx < 2; idx += 1) {
      expect((await app.inject({ method: 'DELETE', url: '/api/tasks/delete-task', headers })).statusCode).toBe(200)
      expect((await app.inject({ method: 'DELETE', url: '/api/skills/delete-skill', headers })).statusCode).toBe(200)
    }
  })

  it('任务列表并发删除时返回同一 SQL 快照', async () => {
    const headers = { authorization: 'Bearer snapshot-user' }
    await uploadAsset('snapshot-asset', Buffer.from('snapshot'), 'image', 'snapshot-user')
    expect((await app.inject({
      method: 'PUT',
      url: '/api/tasks/snapshot-task',
      headers,
      payload: {
        task: { id: 'snapshot-task', prompt: '旧快照' },
        assets: [{ assetId: 'snapshot-asset', role: 'output', index: 0 }]
      }
    })).statusCode).toBe(200)

    const pause = db.pauseAfterQuery('FROM cloud_tasks t')
    const listing = app.inject({ method: 'GET', url: '/api/tasks', headers })
    await pause.started
    expect((await app.inject({ method: 'DELETE', url: '/api/tasks/snapshot-task', headers })).statusCode).toBe(200)
    pause.release()

    const res = await listing
    expect(res.statusCode).toBe(200)
    const tasks = res.json<{ data: Array<{ id: string; assets: unknown[] }> }>().data
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ id: 'snapshot-task' })
    expect(tasks[0]!.assets).toHaveLength(1)
    expect((await app.inject({ method: 'GET', url: '/api/tasks', headers })).json().data).toEqual([])
  })

  it('递归移除常见 camelCase、snake_case 和 kebab-case 密钥字段', async () => {
    const headers = { authorization: 'Bearer secret-fields' }
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/tasks/secret-task',
      headers,
      payload: {
        task: {
          id: 'secret-task',
          apiKey: 'a',
          api_key: 'b',
          'api-key': 'c',
          nested: {
            accessToken: 'd',
            access_token: 'e',
            'access-token': 'f',
            refreshToken: 'g',
            refresh_token: 'h',
            'refresh-token': 'i',
            authorization: 'j',
            keep: 'ok'
          }
        },
        assets: []
      }
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().data.task).toEqual({ id: 'secret-task', nested: { keep: 'ok' } })

    const stored = await db.query<{ task_json: Record<string, unknown> }>(`
      SELECT task_json FROM cloud_tasks WHERE source_task_id = 'secret-task'
    `)
    expect(stored.rows[0]!.task_json).toEqual({ id: 'secret-task', nested: { keep: 'ok' } })
  })
})
