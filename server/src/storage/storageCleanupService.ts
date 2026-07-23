import type { QueryResultRow } from 'pg'

import type { Db, TransactionalDb } from '../database/database.js'
import type { StorageDriver } from './storageDriver.js'

type DeletionRow = QueryResultRow & {
  object_key: string
}

export class StorageCleanupService {
  constructor(
    private db: TransactionalDb,
    private storage: StorageDriver,
    private isReferenced: (key: string, db: Db) => Promise<boolean>
  ) {}

  async enqueue(key: string, db: Db = this.db) {
    await db.query(`
      INSERT INTO cloud_storage_deletions (object_key)
      VALUES ($1)
      ON CONFLICT (object_key) DO NOTHING
    `, [key])
  }

  async cancel(key: string, db: Db) {
    const result = await db.query(`
      SELECT 1 FROM cloud_storage_deletions
      WHERE object_key = $1
      FOR UPDATE
    `, [key])
    if (result.rowCount) {
      await db.query('DELETE FROM cloud_storage_deletions WHERE object_key = $1', [key])
    }
  }

  async flushKeys(keys: string[]) {
    for (const key of keys) {
      try {
        await this.db.tx(async (tx) => {
          const pending = await tx.query(`
            SELECT 1 FROM cloud_storage_deletions
            WHERE object_key = $1
            FOR UPDATE
          `, [key])
          if (!pending.rowCount) return

          if (!await this.isReferenced(key, tx)) await this.storage.delete(key)
          await tx.query('DELETE FROM cloud_storage_deletions WHERE object_key = $1', [key])
        })
      } catch (err) {
        await this.db.query(`
          UPDATE cloud_storage_deletions SET
            attempts = attempts + 1,
            last_error = $1,
            updated_at = now()
          WHERE object_key = $2
        `, [(err as Error).message.slice(0, 500), key])
        console.warn('云端文件清理失败，已保留重试记录', { key, err })
      }
    }
  }

  async flush(limit = 100) {
    const result = await this.db.query<DeletionRow>(`
      SELECT object_key FROM cloud_storage_deletions
      ORDER BY attempts, updated_at, created_at
      LIMIT $1
    `, [limit])
    await this.flushKeys(result.rows.map((row) => row.object_key))
  }
}
