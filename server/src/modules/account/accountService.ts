import { randomUUID } from 'node:crypto'

import type { QueryResultRow } from 'pg'

import type { Db } from '../../database/database.js'
import { AppError } from '../../errors.js'
import type { AuthUser } from '../auth/authProvider.js'

type AccountRow = QueryResultRow & {
  id: string
  provider: 'sub2api'
  external_user_id: string
  email_snapshot: string | null
  created_at: Date | string
  last_seen_at: Date | string
}

export class AccountService {
  constructor(private db: Db) {}

  async ensure(user: AuthUser) {
    const result = await this.db.query<AccountRow>(`
      INSERT INTO cloud_accounts (id, provider, external_user_id, email_snapshot)
      VALUES ($1, 'sub2api', $2, $3)
      ON CONFLICT (provider, external_user_id) DO UPDATE SET
        email_snapshot = COALESCE(EXCLUDED.email_snapshot, cloud_accounts.email_snapshot),
        last_seen_at = now()
      RETURNING *
    `, [randomUUID(), user.id, user.email ?? null])
    return result.rows[0]!
  }

  async get(id: string) {
    const result = await this.db.query<AccountRow>('SELECT * FROM cloud_accounts WHERE id = $1', [id])
    if (!result.rows[0]) throw new AppError(404, 'ACCOUNT_NOT_FOUND', '云端账号不存在')
    return result.rows[0]
  }

  async lock(id: string, db: Db) {
    const result = await db.query<AccountRow>('SELECT * FROM cloud_accounts WHERE id = $1 FOR UPDATE', [id])
    if (!result.rows[0]) throw new AppError(404, 'ACCOUNT_NOT_FOUND', '云端账号不存在')
    return result.rows[0]
  }

  toPublic(row: AccountRow, usedBytes: number, quotaBytes: number) {
    return {
      id: row.id,
      provider: row.provider,
      externalUserId: row.external_user_id,
      ...(row.email_snapshot ? { email: row.email_snapshot } : {}),
      usedBytes,
      quotaBytes,
      createdAt: new Date(row.created_at).toISOString(),
      lastSeenAt: new Date(row.last_seen_at).toISOString()
    }
  }
}
