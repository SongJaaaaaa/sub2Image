import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'

import type { QueryResultRow } from 'pg'

import type { CloudConfig } from '../../config.js'
import type { Db, TransactionalDb } from '../../database/database.js'
import { AppError } from '../../errors.js'
import type { StorageCleanupService } from '../../storage/storageCleanupService.js'
import type { StorageDriver } from '../../storage/storageDriver.js'
import type { AssetKind, AssetMetadata } from '../../types.js'
import type { AccountService } from '../account/accountService.js'
import type { AssetRow, AssetService } from '../assets/assetService.js'

export type CreateUploadInput = {
  assetId: string
  kind: AssetKind
  mimeType: string
  size: number
  sha256: string
  metadata: AssetMetadata
}

type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'completing' | 'complete'

type UploadRow = QueryResultRow & {
  id: string
  account_id: string
  source_asset_id: string
  kind: AssetKind
  mime_type: string
  expected_size: string | number
  expected_sha256: string
  metadata: AssetMetadata
  temp_object_key: string | null
  uploaded_size: string | number | null
  uploaded_sha256: string | null
  status: UploadStatus
  claim_id: string | null
  claim_expires_at: Date | string | null
  final_object_key: string | null
  asset_id: string | null
  created_at: Date | string
  updated_at: Date | string
}

export async function hasActiveUploadObjectKey(key: string, db: Db) {
  const result = await db.query(`
    SELECT 1 FROM cloud_uploads
    WHERE final_object_key = $1
      AND status = 'completing'
      AND claim_expires_at > now()
    LIMIT 1
  `, [key])
  return Boolean(result.rowCount)
}

export class UploadService {
  constructor(
    private db: TransactionalDb,
    private storage: StorageDriver,
    private cleanup: StorageCleanupService,
    private assets: AssetService,
    private accounts: AccountService,
    private cfg: CloudConfig
  ) {}

  private validate(input: CreateUploadInput) {
    if (!input.assetId || input.assetId.length > 300) {
      throw new AppError(400, 'INVALID_ASSET_ID', '资源 ID 无效')
    }
    if (!/^[a-f0-9]{64}$/.test(input.sha256)) {
      throw new AppError(400, 'INVALID_SHA256', 'SHA-256 无效')
    }
    if (!Number.isSafeInteger(input.size) || input.size <= 0) {
      throw new AppError(400, 'INVALID_FILE_SIZE', '文件大小无效')
    }
    if (Buffer.byteLength(JSON.stringify(input.metadata), 'utf8') > this.cfg.maxAssetMetadataSize) {
      throw new AppError(413, 'ASSET_METADATA_TOO_LARGE', '资源元数据超过允许大小')
    }

    const types = input.kind === 'image' ? this.cfg.allowedImageTypes : this.cfg.allowedVideoTypes
    const max = input.kind === 'image' ? this.cfg.maxImageSize : this.cfg.maxVideoSize
    if (!types.includes(input.mimeType)) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', '不支持该文件类型')
    if (input.size > max) throw new AppError(413, 'FILE_TOO_LARGE', '文件超过允许大小')
  }

  private async find(accountId: string, assetId: string, db: Db = this.db, lock = false) {
    const result = await db.query<UploadRow>(`
      SELECT * FROM cloud_uploads
      WHERE account_id = $1 AND source_asset_id = $2
      ${lock ? 'FOR UPDATE' : ''}
    `, [accountId, assetId])
    return result.rows[0] ?? null
  }

  private same(row: UploadRow, input: CreateUploadInput) {
    return row.kind === input.kind &&
      row.mime_type === input.mimeType &&
      Number(row.expected_size) === input.size &&
      row.expected_sha256 === input.sha256
  }

  private isClaimActive(row: UploadRow) {
    return Boolean(row.claim_expires_at && new Date(row.claim_expires_at).getTime() > Date.now())
  }

  private finalKey(row: Pick<UploadRow, 'account_id' | 'kind' | 'expected_sha256'>) {
    return `${row.account_id}/objects/${row.kind}/${row.expected_sha256}`
  }

  private async insertComplete(input: CreateUploadInput, accountId: string, asset: AssetRow, db: Db) {
    const result = await db.query<UploadRow>(`
      INSERT INTO cloud_uploads (
        id, account_id, source_asset_id, kind, mime_type, expected_size,
        expected_sha256, metadata, status, asset_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'complete', $9)
      RETURNING *
    `, [
      randomUUID(), accountId, input.assetId, input.kind, input.mimeType,
      input.size, input.sha256, input.metadata, asset.id
    ])
    return result.rows[0]!
  }

  private toPublic(row: UploadRow, asset?: AssetRow | null) {
    return {
      id: row.id,
      assetId: row.source_asset_id,
      status: row.status,
      uploadRequired: row.status === 'pending',
      ...(asset ? { asset: this.assets.toPublic(asset, row.source_asset_id) } : {})
    }
  }

  async create(accountId: string, input: CreateUploadInput) {
    this.validate(input)

    const result = await this.db.tx(async (tx) => {
      await this.accounts.lock(accountId, tx)
      const keys: string[] = []
      let current = await this.find(accountId, input.assetId, tx, true)

      if (current && current.status !== 'complete' && !this.isClaimActive(current) &&
        new Date(current.updated_at).getTime() < Date.now() - this.cfg.uploadTtl) {
        if (current.temp_object_key) {
          await this.cleanup.enqueue(current.temp_object_key, tx)
          keys.push(current.temp_object_key)
        }
        if (current.final_object_key) {
          await this.cleanup.enqueue(current.final_object_key, tx)
          keys.push(current.final_object_key)
        }
        await tx.query('DELETE FROM cloud_uploads WHERE id = $1', [current.id])
        current = null
      }

      if (current) {
        if (!this.same(current, input)) {
          throw new AppError(409, 'UPLOAD_CONFLICT', '资源 ID 已使用不同的文件信息')
        }
        if ((current.status === 'uploading' || current.status === 'completing') && this.isClaimActive(current)) {
          throw new AppError(409, 'UPLOAD_IN_PROGRESS', '上传正在处理中')
        }
        if (current.status === 'uploading' || current.status === 'completing') {
          if (current.status === 'uploading' && current.temp_object_key) {
            await this.cleanup.enqueue(current.temp_object_key, tx)
            keys.push(current.temp_object_key)
          }
          if (current.final_object_key) {
            await this.cleanup.enqueue(current.final_object_key, tx)
            keys.push(current.final_object_key)
          }
          const status = current.status === 'completing' && current.temp_object_key ? 'uploaded' : 'pending'
          const recovered = await tx.query<UploadRow>(`
            UPDATE cloud_uploads SET
              status = $1,
              temp_object_key = $2,
              uploaded_size = $3,
              uploaded_sha256 = $4,
              claim_id = NULL,
              claim_expires_at = NULL,
              final_object_key = NULL,
              updated_at = now()
            WHERE id = $5
            RETURNING *
          `, [
            status,
            status === 'uploaded' ? current.temp_object_key : null,
            status === 'uploaded' ? current.uploaded_size : null,
            status === 'uploaded' ? current.uploaded_sha256 : null,
            current.id
          ])
          current = recovered.rows[0]!
        }
        const asset = current.asset_id
          ? await this.assets.getById(accountId, current.asset_id, tx)
          : null
        return { data: this.toPublic(current, asset), keys }
      }

      const linked = await this.assets.findBySource(accountId, input.assetId, tx)
      if (linked) {
        if (linked.sha256 !== input.sha256 || linked.kind !== input.kind) {
          throw new AppError(409, 'ASSET_ID_CONFLICT', '资源 ID 已指向其他内容')
        }
        const row = await this.insertComplete(input, accountId, linked, tx)
        return { data: this.toPublic(row, linked), keys }
      }

      const uploads = await tx.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count FROM cloud_uploads
        WHERE account_id = $1 AND status <> 'complete'
      `, [accountId])
      const aliases = await tx.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count FROM cloud_asset_aliases
        WHERE account_id = $1
      `, [accountId])
      const uploadCount = Number(uploads.rows[0]?.count ?? 0)
      const assetCount = Number(aliases.rows[0]?.count ?? 0)
      if (assetCount + uploadCount >= this.cfg.maxAssetCount) {
        throw new AppError(413, 'ASSET_LIMIT_EXCEEDED', '云端资源数量已达上限')
      }

      const duplicate = await this.assets.findByHash(accountId, input.sha256, input.kind, tx)
      if (duplicate) {
        await this.assets.linkAlias(accountId, input.assetId, duplicate.id, tx)
        const row = await this.insertComplete(input, accountId, duplicate, tx)
        return { data: this.toPublic(row, duplicate), keys }
      }

      if (uploadCount >= this.cfg.maxUploadCount) {
        throw new AppError(413, 'UPLOAD_LIMIT_EXCEEDED', '未完成上传数量已达上限')
      }

      const used = await this.assets.getUsage(accountId, tx)
      const reserved = await tx.query<{ size: string }>(`
        SELECT COALESCE(SUM(expected_size), 0)::text AS size
        FROM cloud_uploads
        WHERE account_id = $1 AND status <> 'complete'
      `, [accountId])
      if (used + Number(reserved.rows[0]?.size ?? 0) + input.size > this.cfg.quotaBytes) {
        throw new AppError(413, 'QUOTA_EXCEEDED', '云端存储空间不足')
      }

      const created = await tx.query<UploadRow>(`
        INSERT INTO cloud_uploads (
          id, account_id, source_asset_id, kind, mime_type, expected_size,
          expected_sha256, metadata, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
        RETURNING *
      `, [
        randomUUID(), accountId, input.assetId, input.kind, input.mimeType,
        input.size, input.sha256, input.metadata
      ])
      return { data: this.toPublic(created.rows[0]!), keys }
    })

    await this.cleanup.flushKeys(result.keys)
    return result.data
  }

  async putContent(
    accountId: string,
    id: string,
    mimeType: string,
    body: Readable,
    contentLength?: number
  ) {
    const claim = randomUUID()
    const key = `${accountId}/uploads/${id}/${claim}`
    let claimed: { row: UploadRow; oldKeys: string[]; asset: AssetRow | null }

    try {
      claimed = await this.db.tx(async (tx) => {
        const result = await tx.query<UploadRow>(`
          SELECT * FROM cloud_uploads WHERE id = $1 AND account_id = $2 FOR UPDATE
        `, [id, accountId])
        const row = result.rows[0]
        if (!row) throw new AppError(404, 'UPLOAD_NOT_FOUND', '上传记录不存在')
        if (row.status === 'complete') {
          return { row, oldKeys: [], asset: await this.assets.getById(accountId, row.asset_id!, tx) }
        }
        if (mimeType !== row.mime_type) {
          throw new AppError(415, 'MIME_TYPE_MISMATCH', '上传文件类型与声明不一致')
        }
        if (contentLength !== undefined && contentLength !== Number(row.expected_size)) {
          throw new AppError(422, 'FILE_SIZE_MISMATCH', '上传文件大小与声明不一致')
        }
        if ((row.status === 'uploading' || row.status === 'completing') && this.isClaimActive(row)) {
          throw new AppError(409, 'UPLOAD_IN_PROGRESS', '上传正在处理中')
        }

        const oldKeys: string[] = []
        if (row.temp_object_key) {
          await this.cleanup.enqueue(row.temp_object_key, tx)
          oldKeys.push(row.temp_object_key)
        }
        if (row.final_object_key) {
          await this.cleanup.enqueue(row.final_object_key, tx)
          oldKeys.push(row.final_object_key)
        }
        const updated = await tx.query<UploadRow>(`
          UPDATE cloud_uploads SET
            temp_object_key = $1,
            uploaded_size = NULL,
            uploaded_sha256 = NULL,
            status = 'uploading',
            claim_id = $2,
            claim_expires_at = $3,
            final_object_key = NULL,
            updated_at = now()
          WHERE id = $4
          RETURNING *
        `, [key, claim, new Date(Date.now() + this.cfg.uploadClaimTtl), row.id])
        return { row: updated.rows[0]!, oldKeys, asset: null }
      })
    } catch (err) {
      body.resume()
      throw err
    }

    if (claimed.asset) {
      body.resume()
      return this.toPublic(claimed.row, claimed.asset)
    }
    await this.cleanup.flushKeys(claimed.oldKeys)

    let stored
    try {
      stored = await this.storage.put({
        key,
        body,
        maxBytes: Number(claimed.row.expected_size)
      })
    } catch (err) {
      await this.resetContentClaim(id, claim, key)
      throw err
    }

    if (stored.size !== Number(claimed.row.expected_size) || stored.sha256 !== claimed.row.expected_sha256) {
      await this.resetContentClaim(id, claim, key)
      throw new AppError(422, 'FILE_CHECKSUM_MISMATCH', '上传文件校验失败')
    }

    try {
      const updated = await this.db.tx(async (tx) => {
        const result = await tx.query<UploadRow>(`
          SELECT * FROM cloud_uploads WHERE id = $1 AND account_id = $2 FOR UPDATE
        `, [id, accountId])
        const row = result.rows[0]
        if (!row || row.status !== 'uploading' || row.claim_id !== claim) {
          await this.cleanup.enqueue(key, tx)
          return null
        }
        const saved = await tx.query<UploadRow>(`
          UPDATE cloud_uploads SET
            uploaded_size = $1,
            uploaded_sha256 = $2,
            status = 'uploaded',
            claim_id = NULL,
            claim_expires_at = NULL,
            updated_at = now()
          WHERE id = $3
          RETURNING *
        `, [stored.size, stored.sha256, row.id])
        return saved.rows[0]!
      })
      if (updated) return this.toPublic(updated)

      await this.cleanup.flushKeys([key])
      throw new AppError(409, 'UPLOAD_CLAIM_LOST', '上传已被其他请求接管')
    } catch (err) {
      if (err instanceof AppError && err.code === 'UPLOAD_CLAIM_LOST') throw err
      await this.resetContentClaim(id, claim, key)
      throw err
    }
  }

  private async resetContentClaim(id: string, claim: string, key: string) {
    await this.db.tx(async (tx) => {
      await this.cleanup.enqueue(key, tx)
      await tx.query(`
        UPDATE cloud_uploads SET
          temp_object_key = NULL,
          uploaded_size = NULL,
          uploaded_sha256 = NULL,
          status = 'pending',
          claim_id = NULL,
          claim_expires_at = NULL,
          updated_at = now()
        WHERE id = $1 AND claim_id = $2
      `, [id, claim])
    })
    await this.cleanup.flushKeys([key])
  }

  async complete(accountId: string, id: string) {
    const claim = randomUUID()
    const claimed = await this.db.tx(async (tx) => {
      const result = await tx.query<UploadRow>(`
        SELECT * FROM cloud_uploads WHERE id = $1 AND account_id = $2 FOR UPDATE
      `, [id, accountId])
      const row = result.rows[0]
      if (!row) throw new AppError(404, 'UPLOAD_NOT_FOUND', '上传记录不存在')
      if (row.status === 'complete') {
        return { row, asset: await this.assets.getById(accountId, row.asset_id!, tx) }
      }
      if ((row.status === 'uploading' || row.status === 'completing') && this.isClaimActive(row)) {
        throw new AppError(409, 'UPLOAD_IN_PROGRESS', '上传正在处理中')
      }
      if ((row.status !== 'uploaded' && row.status !== 'completing') || !row.temp_object_key) {
        throw new AppError(409, 'UPLOAD_NOT_READY', '文件内容尚未上传完成')
      }

      const objectKey = this.finalKey(row)
      await this.cleanup.cancel(objectKey, tx)
      const updated = await tx.query<UploadRow>(`
        UPDATE cloud_uploads SET
          status = 'completing',
          claim_id = $1,
          claim_expires_at = $2,
          final_object_key = $3,
          updated_at = now()
        WHERE id = $4
        RETURNING *
      `, [claim, new Date(Date.now() + this.cfg.uploadClaimTtl), objectKey, row.id])
      return { row: updated.rows[0]!, asset: null }
    })

    if (claimed.asset) return this.assets.toPublic(claimed.asset, claimed.row.source_asset_id)

    const row = claimed.row
    const tempKey = row.temp_object_key!
    const objectKey = row.final_object_key!
    try {
      const stream = await this.storage.open(tempKey)
      const stored = await this.storage.put({
        key: objectKey,
        body: stream,
        maxBytes: Number(row.expected_size)
      })
      if (stored.size !== Number(row.expected_size) || stored.sha256 !== row.expected_sha256) {
        throw new AppError(500, 'STORED_FILE_INVALID', '文件保存校验失败')
      }

      const saved = await this.db.tx(async (tx) => {
        await this.accounts.lock(accountId, tx)
        const result = await tx.query<UploadRow>(`
          SELECT * FROM cloud_uploads WHERE id = $1 AND account_id = $2 FOR UPDATE
        `, [id, accountId])
        const current = result.rows[0]
        if (!current || current.status !== 'completing' || current.claim_id !== claim) {
          await this.cleanup.enqueue(objectKey, tx)
          return null
        }

        await this.cleanup.cancel(objectKey, tx)
        const duplicate = await this.assets.findByHash(accountId, current.expected_sha256, current.kind, tx)
        const asset = duplicate ?? await this.assets.create({
          accountId,
          assetId: current.source_asset_id,
          kind: current.kind,
          mimeType: current.mime_type,
          size: Number(current.expected_size),
          sha256: current.expected_sha256,
          objectKey,
          metadata: current.metadata
        }, tx)
        if (duplicate) await this.assets.linkAlias(accountId, current.source_asset_id, duplicate.id, tx)

        await this.cleanup.enqueue(tempKey, tx)
        await tx.query(`
          UPDATE cloud_uploads SET
            status = 'complete',
            asset_id = $1,
            temp_object_key = NULL,
            claim_id = NULL,
            claim_expires_at = NULL,
            final_object_key = NULL,
            updated_at = now()
          WHERE id = $2
        `, [asset.id, current.id])
        return asset
      })

      if (!saved) {
        await this.cleanup.flushKeys([objectKey])
        throw new AppError(409, 'UPLOAD_CLAIM_LOST', '上传已被其他请求接管')
      }
      await this.cleanup.flushKeys([tempKey])
      return this.assets.toPublic(saved, row.source_asset_id)
    } catch (err) {
      if (!(err instanceof AppError && err.code === 'UPLOAD_CLAIM_LOST')) {
        await this.resetCompleteClaim(id, claim, objectKey)
      }
      throw err
    }
  }

  private async resetCompleteClaim(id: string, claim: string, objectKey: string) {
    await this.db.tx(async (tx) => {
      await this.cleanup.enqueue(objectKey, tx)
      await tx.query(`
        UPDATE cloud_uploads SET
          status = CASE WHEN temp_object_key IS NULL THEN 'pending' ELSE 'uploaded' END,
          claim_id = NULL,
          claim_expires_at = NULL,
          final_object_key = NULL,
          updated_at = now()
        WHERE id = $1 AND claim_id = $2
      `, [id, claim])
    })
    await this.cleanup.flushKeys([objectKey])
  }

  async cancel(accountId: string, id: string) {
    const keys = await this.db.tx(async (tx) => {
      const result = await tx.query<UploadRow>(`
        SELECT * FROM cloud_uploads WHERE id = $1 AND account_id = $2 FOR UPDATE
      `, [id, accountId])
      const row = result.rows[0]
      if (!row) return []
      if (row.status === 'complete') throw new AppError(409, 'UPLOAD_COMPLETE', '已完成的上传不能取消')
      if ((row.status === 'uploading' || row.status === 'completing') && this.isClaimActive(row)) {
        throw new AppError(409, 'UPLOAD_IN_PROGRESS', '上传正在处理中')
      }

      const keys = [row.temp_object_key, row.final_object_key].filter((key): key is string => Boolean(key))
      for (const key of keys) await this.cleanup.enqueue(key, tx)
      await tx.query('DELETE FROM cloud_uploads WHERE id = $1', [row.id])
      return keys
    })
    await this.cleanup.flushKeys(keys)
  }

  async expire(limit = 500) {
    const now = new Date()
    const cutoff = new Date(now.getTime() - this.cfg.uploadTtl)
    const keys = await this.db.tx(async (tx) => {
      const result = await tx.query<UploadRow>(`
        SELECT * FROM cloud_uploads
        WHERE status <> 'complete'
          AND updated_at < $1
          AND (claim_expires_at IS NULL OR claim_expires_at <= $2)
        ORDER BY updated_at, id
        LIMIT $3
        FOR UPDATE
      `, [cutoff, now, limit])
      const keys = result.rows.flatMap((row) => [row.temp_object_key, row.final_object_key])
        .filter((key): key is string => Boolean(key))
      for (const key of keys) await this.cleanup.enqueue(key, tx)
      for (const row of result.rows) await tx.query('DELETE FROM cloud_uploads WHERE id = $1', [row.id])
      return [...new Set(keys)]
    })
    await this.cleanup.flushKeys(keys)
  }
}
