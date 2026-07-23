import { randomUUID } from 'node:crypto'

import type { QueryResultRow } from 'pg'

import type { Db } from '../../database/database.js'
import { AppError } from '../../errors.js'
import type { AssetKind, AssetMetadata, CloudAsset } from '../../types.js'

export type AssetRow = QueryResultRow & {
  id: string
  account_id: string
  sha256: string
  kind: AssetKind
  mime_type: string
  byte_size: string | number
  object_key: string
  metadata: AssetMetadata
  created_at: Date | string
}

type AliasedAssetRow = AssetRow & {
  source_asset_id: string
}

type CreateAssetInput = {
  accountId: string
  assetId: string
  kind: AssetKind
  mimeType: string
  size: number
  sha256: string
  objectKey: string
  metadata: AssetMetadata
}

export class AssetService {
  constructor(private db: Db) {}

  async getUsage(accountId: string, db: Db = this.db) {
    const result = await db.query<{ used: string }>(`
      SELECT COALESCE(SUM(byte_size), 0)::text AS used
      FROM cloud_assets
      WHERE account_id = $1
    `, [accountId])
    return Number(result.rows[0]?.used ?? 0)
  }

  async hasObjectKey(key: string, db: Db = this.db) {
    const result = await db.query('SELECT 1 FROM cloud_assets WHERE object_key = $1 LIMIT 1', [key])
    return Boolean(result.rowCount)
  }

  async findBySource(accountId: string, assetId: string, db: Db = this.db) {
    const result = await db.query<AliasedAssetRow>(`
      SELECT a.*, aa.source_asset_id
      FROM cloud_asset_aliases aa
      JOIN cloud_assets a ON a.id = aa.asset_id
      WHERE aa.account_id = $1 AND aa.source_asset_id = $2
    `, [accountId, assetId])
    return result.rows[0] ?? null
  }

  async findByHash(accountId: string, sha256: string, kind: AssetKind, db: Db = this.db) {
    const result = await db.query<AssetRow>(`
      SELECT * FROM cloud_assets
      WHERE account_id = $1 AND sha256 = $2 AND kind = $3
    `, [accountId, sha256, kind])
    return result.rows[0] ?? null
  }

  async linkAlias(accountId: string, assetId: string, id: string, db: Db = this.db) {
    await db.query(`
      INSERT INTO cloud_asset_aliases (account_id, source_asset_id, asset_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (account_id, source_asset_id) DO NOTHING
    `, [accountId, assetId, id])

    const linked = await this.findBySource(accountId, assetId, db)
    if (!linked || linked.id !== id) {
      throw new AppError(409, 'ASSET_ID_CONFLICT', '资源 ID 已指向其他内容')
    }
    return linked
  }

  async create(input: CreateAssetInput, db: Db = this.db) {
    await db.query(`
      INSERT INTO cloud_assets (
        id, account_id, sha256, kind, mime_type, byte_size, object_key, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (account_id, sha256, kind) DO NOTHING
    `, [
      randomUUID(),
      input.accountId,
      input.sha256,
      input.kind,
      input.mimeType,
      input.size,
      input.objectKey,
      input.metadata
    ])

    const asset = await this.findByHash(input.accountId, input.sha256, input.kind, db)
    if (!asset) throw new AppError(500, 'ASSET_CREATE_FAILED', '资源保存失败')
    await this.linkAlias(input.accountId, input.assetId, asset.id, db)
    return asset
  }

  async resolveSources(accountId: string, ids: string[], db: Db = this.db, lock = false) {
    if (!ids.length) return new Map<string, AssetRow>()

    const result = await db.query<AliasedAssetRow>(`
      SELECT a.*, aa.source_asset_id
      FROM cloud_asset_aliases aa
      JOIN cloud_assets a ON a.id = aa.asset_id
      WHERE aa.account_id = $1 AND aa.source_asset_id = ANY($2::text[])
      ORDER BY a.id
      ${lock ? 'FOR SHARE' : ''}
    `, [accountId, ids])
    return new Map(result.rows.map((row) => [row.source_asset_id, row]))
  }

  async getByIds(accountId: string, ids: string[], db: Db = this.db) {
    if (!ids.length) return new Map<string, AssetRow>()
    const result = await db.query<AssetRow>(`
      SELECT * FROM cloud_assets
      WHERE account_id = $1 AND id = ANY($2::uuid[])
    `, [accountId, ids])
    return new Map(result.rows.map((row) => [row.id, row]))
  }

  async getById(accountId: string, id: string, db: Db = this.db, lock = false) {
    const result = await db.query<AssetRow>(`
      SELECT * FROM cloud_assets
      WHERE account_id = $1 AND id = $2
      ${lock ? 'FOR UPDATE' : ''}
    `, [accountId, id])
    if (!result.rows[0]) throw new AppError(404, 'ASSET_NOT_FOUND', '资源不存在')
    return result.rows[0]
  }

  async findById(accountId: string, id: string, db: Db = this.db, lock = false) {
    const result = await db.query<AssetRow>(`
      SELECT * FROM cloud_assets
      WHERE account_id = $1 AND id = $2
      ${lock ? 'FOR UPDATE' : ''}
    `, [accountId, id])
    return result.rows[0] ?? null
  }

  async remove(accountId: string, id: string, db: Db = this.db) {
    const result = await db.query('DELETE FROM cloud_assets WHERE account_id = $1 AND id = $2', [accountId, id])
    if (!result.rowCount) throw new AppError(404, 'ASSET_NOT_FOUND', '资源不存在')
  }

  toPublic(row: AssetRow, assetId: string): CloudAsset {
    return {
      id: row.id,
      assetId,
      kind: row.kind,
      mimeType: row.mime_type,
      size: Number(row.byte_size),
      sha256: row.sha256,
      metadata: row.metadata,
      contentUrl: `/cloud-api/assets/${row.id}/content`,
      createdAt: new Date(row.created_at).toISOString()
    }
  }
}
