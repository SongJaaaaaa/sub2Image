import { randomUUID } from 'node:crypto'

import type { QueryResultRow } from 'pg'

import type { TransactionalDb } from '../../database/database.js'
import { AppError } from '../../errors.js'
import type { CloudSkill } from '../../types.js'
import type { AccountService } from '../account/accountService.js'
import type { MetadataQuotaService } from '../account/metadataQuotaService.js'

type SkillRow = QueryResultRow & {
  source_skill_id: string
  version: number
  file_name: string
  markdown: string
  created_at: Date | string
  updated_at: Date | string
}

export class SkillService {
  constructor(
    private db: TransactionalDb,
    private accounts: AccountService,
    private quota: MetadataQuotaService,
    private maxSize: number
  ) {}

  private toPublic(row: SkillRow): CloudSkill {
    return {
      id: row.source_skill_id,
      version: row.version,
      fileName: row.file_name,
      markdown: row.markdown,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    }
  }

  async list(accountId: string) {
    const result = await this.db.query<SkillRow>(`
      SELECT source_skill_id, version, file_name, markdown, created_at, updated_at
      FROM cloud_skills
      WHERE account_id = $1
      ORDER BY updated_at DESC, source_skill_id
    `, [accountId])
    return result.rows.map((row) => this.toPublic(row))
  }

  async put(accountId: string, id: string, version: number, fileName: string, markdown: string) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new AppError(400, 'INVALID_SKILL_ID', 'Skill ID 无效')
    }
    if (!Number.isInteger(version) || version < 1 || version > 2147483647) {
      throw new AppError(400, 'INVALID_SKILL_VERSION', 'Skill 版本无效')
    }
    if (!fileName || fileName.length > 255 || !fileName.toLowerCase().endsWith('.md')) {
      throw new AppError(400, 'INVALID_SKILL_FILE_NAME', 'Skill 文件名无效')
    }
    if (!markdown || Buffer.byteLength(markdown, 'utf8') > this.maxSize) {
      throw new AppError(413, 'SKILL_TOO_LARGE', 'Skill 文件超过允许大小')
    }

    return this.db.tx(async (tx) => {
      await this.accounts.lock(accountId, tx)
      await this.quota.checkSkill(accountId, id, Buffer.byteLength(markdown, 'utf8'), tx)
      const result = await tx.query<SkillRow>(`
        INSERT INTO cloud_skills (
          id, account_id, source_skill_id, version, file_name, markdown
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (account_id, source_skill_id) DO UPDATE SET
          version = EXCLUDED.version,
          file_name = EXCLUDED.file_name,
          markdown = EXCLUDED.markdown,
          updated_at = now()
        RETURNING source_skill_id, version, file_name, markdown, created_at, updated_at
      `, [randomUUID(), accountId, id, version, fileName, markdown])
      return this.toPublic(result.rows[0]!)
    })
  }

  async delete(accountId: string, id: string) {
    await this.db.query(`
      DELETE FROM cloud_skills WHERE account_id = $1 AND source_skill_id = $2
    `, [accountId, id])
  }
}
