import { randomUUID } from 'node:crypto'

import type { QueryResultRow } from 'pg'

import type { Db, TransactionalDb } from '../../database/database.js'
import { AppError } from '../../errors.js'
import type { StorageCleanupService } from '../../storage/storageCleanupService.js'
import type { CloudTask, TaskAssetRef, TaskAssetRole } from '../../types.js'
import type { AccountService } from '../account/accountService.js'
import type { MetadataQuotaService } from '../account/metadataQuotaService.js'
import type { AssetRow, AssetService } from '../assets/assetService.js'

type TaskRow = QueryResultRow & {
  id: string
  account_id: string
  source_task_id: string
  task_json: Record<string, unknown>
  created_at: Date | string
  updated_at: Date | string
}

type TaskListRow = TaskRow & {
  asset_id: string | null
  source_asset_id: string | null
  role: TaskAssetRole | null
  position: number | null
  asset_sha256: string | null
  asset_kind: AssetRow['kind'] | null
  asset_mime_type: string | null
  asset_byte_size: string | number | null
  asset_object_key: string | null
  asset_metadata: AssetRow['metadata'] | null
  asset_created_at: Date | string | null
}

export class TaskService {
  constructor(
    private db: TransactionalDb,
    private assets: AssetService,
    private cleanup: StorageCleanupService,
    private accounts: AccountService,
    private quota: MetadataQuotaService,
    private maxTaskSize: number,
    private maxAssets: number
  ) {}

  async put(accountId: string, id: string, task: Record<string, unknown>, refs: TaskAssetRef[]) {
    if (!id || id.length > 200) throw new AppError(400, 'INVALID_TASK_ID', '任务 ID 无效')
    if (task.id !== id) throw new AppError(400, 'TASK_ID_MISMATCH', '任务 ID 与请求路径不一致')
    if (Buffer.byteLength(JSON.stringify(task), 'utf8') > this.maxTaskSize) {
      throw new AppError(413, 'TASK_TOO_LARGE', '任务数据超过允许大小')
    }
    if (refs.length > this.maxAssets) throw new AppError(400, 'TOO_MANY_ASSETS', '任务关联资源过多')

    const slots = new Set<string>()
    for (const ref of refs) {
      if (!ref.assetId || ref.assetId.length > 300 ||
        !Number.isInteger(ref.index) || ref.index < 0 || ref.index > 2147483647) {
        throw new AppError(400, 'INVALID_ASSET_REF', '任务资源引用无效')
      }
      const slot = `${ref.role}:${ref.index}`
      if (slots.has(slot)) throw new AppError(400, 'DUPLICATE_ASSET_SLOT', '任务资源位置重复')
      slots.add(slot)
    }

    const clean = JSON.parse(JSON.stringify(task, (key, value) => {
      if (/^(api[-_]?key|access[-_]?token|refresh[-_]?token|authorization)$/i.test(key)) return undefined
      return value
    })) as Record<string, unknown>
    const bytes = Buffer.byteLength(JSON.stringify(clean), 'utf8')

    const keys = await this.db.tx(async (tx) => {
      await this.accounts.lock(accountId, tx)
      await this.quota.checkTask(accountId, id, bytes, tx)
      const result = await tx.query<TaskRow>(`
        INSERT INTO cloud_tasks (id, account_id, source_task_id, task_json)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (account_id, source_task_id) DO UPDATE SET
          task_json = EXCLUDED.task_json,
          updated_at = now()
        RETURNING *
      `, [randomUUID(), accountId, id, clean])
      const row = result.rows[0]!
      const previous = await tx.query<{ asset_id: string }>(`
        SELECT DISTINCT asset_id FROM cloud_task_assets
        WHERE task_id = $1
        ORDER BY asset_id
      `, [row.id])

      const ids = [...new Set(refs.map((ref) => ref.assetId))]
      const found = await this.assets.resolveSources(accountId, ids, tx, true)
      const missing = ids.filter((assetId) => !found.has(assetId))
      if (missing.length) throw new AppError(409, 'ASSET_NOT_READY', `资源尚未上传完成：${missing.join(', ')}`)

      for (const ref of refs) {
        const asset = found.get(ref.assetId)!
        if (ref.role === 'video' && asset.kind !== 'video') {
          throw new AppError(400, 'INVALID_ASSET_KIND', '视频引用必须使用视频资源')
        }
        if (ref.role !== 'video' && asset.kind !== 'image') {
          throw new AppError(400, 'INVALID_ASSET_KIND', '非视频引用必须使用图片资源')
        }
      }

      await tx.query('DELETE FROM cloud_task_assets WHERE task_id = $1', [row.id])
      for (const ref of refs) {
        await tx.query(`
          INSERT INTO cloud_task_assets (task_id, asset_id, source_asset_id, role, position)
          VALUES ($1, $2, $3, $4, $5)
        `, [row.id, found.get(ref.assetId)!.id, ref.assetId, ref.role, ref.index])
      }

      const currentIds = new Set([...found.values()].map((asset) => asset.id))
      const removed = previous.rows.filter((link) => !currentIds.has(link.asset_id))
      const keys: string[] = []
      for (const link of removed) {
        const asset = await this.assets.getById(accountId, link.asset_id, tx, true)
        if (await this.hasAssetRefs(asset.id, tx)) continue
        await this.cleanup.enqueue(asset.object_key, tx)
        await this.assets.remove(accountId, asset.id, tx)
        keys.push(asset.object_key)
      }
      return keys
    })
    await this.cleanup.flushKeys(keys)

    return this.get(accountId, id)
  }

  async list(accountId: string): Promise<CloudTask[]> {
    const result = await this.db.query<TaskListRow>(`
      SELECT
        t.*,
        ta.asset_id,
        ta.source_asset_id,
        ta.role,
        ta.position,
        a.sha256 AS asset_sha256,
        a.kind AS asset_kind,
        a.mime_type AS asset_mime_type,
        a.byte_size AS asset_byte_size,
        a.object_key AS asset_object_key,
        a.metadata AS asset_metadata,
        a.created_at AS asset_created_at
      FROM cloud_tasks t
      LEFT JOIN cloud_task_assets ta ON ta.task_id = t.id
      LEFT JOIN cloud_assets a ON a.id = ta.asset_id
      WHERE t.account_id = $1
      ORDER BY t.updated_at DESC, t.id, ta.role, ta.position
    `, [accountId])

    const tasks = new Map<string, CloudTask>()
    for (const row of result.rows) {
      const task = tasks.get(row.id) ?? {
        id: row.source_task_id,
        task: row.task_json,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        assets: []
      }
      tasks.set(row.id, task)
      if (!row.asset_id) continue

      task.assets.push({
        ...this.assets.toPublic({
          id: row.asset_id,
          account_id: row.account_id,
          sha256: row.asset_sha256!,
          kind: row.asset_kind!,
          mime_type: row.asset_mime_type!,
          byte_size: row.asset_byte_size!,
          object_key: row.asset_object_key!,
          metadata: row.asset_metadata!,
          created_at: row.asset_created_at!
        }, row.source_asset_id!),
        role: row.role!,
        index: row.position!
      })
    }
    return [...tasks.values()]
  }

  async get(accountId: string, id: string) {
    const tasks = await this.list(accountId)
    const task = tasks.find((item) => item.id === id)
    if (!task) throw new AppError(404, 'TASK_NOT_FOUND', '云端任务不存在')
    return task
  }

  async delete(accountId: string, id: string) {
    const keys = await this.db.tx(async (tx) => {
      const task = await tx.query<{ id: string }>(`
        SELECT id FROM cloud_tasks
        WHERE account_id = $1 AND source_task_id = $2
        FOR UPDATE
      `, [accountId, id])
      if (!task.rows[0]) return []

      const links = await tx.query<{ asset_id: string }>(`
        SELECT DISTINCT asset_id FROM cloud_task_assets
        WHERE task_id = $1
        ORDER BY asset_id
      `, [task.rows[0].id])
      await tx.query('DELETE FROM cloud_tasks WHERE id = $1', [task.rows[0].id])

      const keys: string[] = []
      for (const link of links.rows) {
        const asset = await this.assets.getById(accountId, link.asset_id, tx, true)
        if (await this.hasAssetRefs(asset.id, tx)) continue
        await this.cleanup.enqueue(asset.object_key, tx)
        await this.assets.remove(accountId, asset.id, tx)
        keys.push(asset.object_key)
      }
      return keys
    })
    await this.cleanup.flushKeys(keys)
  }

  async hasAssetRefs(assetId: string, db: Db = this.db) {
    const result = await db.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM cloud_task_assets WHERE asset_id = $1
    `, [assetId])
    return Number(result.rows[0]?.count ?? 0) > 0
  }
}
