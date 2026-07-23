import type { QueryResultRow } from 'pg'

import type { Db } from '../../database/database.js'
import { AppError } from '../../errors.js'

type TaskRow = QueryResultRow & {
  source_task_id: string
  task_json: Record<string, unknown>
}

type SkillRow = QueryResultRow & {
  source_skill_id: string
  markdown: string
}

export class MetadataQuotaService {
  constructor(
    private maxBytes: number,
    private maxTasks: number,
    private maxSkills: number
  ) {}

  private async usage(accountId: string, db: Db) {
    const [tasks, skills] = await Promise.all([
      db.query<TaskRow>(`
        SELECT source_task_id, task_json FROM cloud_tasks WHERE account_id = $1
      `, [accountId]),
      db.query<SkillRow>(`
        SELECT source_skill_id, markdown FROM cloud_skills WHERE account_id = $1
      `, [accountId])
    ])
    const taskBytes = tasks.rows.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row.task_json), 'utf8'), 0)
    const skillBytes = skills.rows.reduce((sum, row) => sum + Buffer.byteLength(row.markdown, 'utf8'), 0)
    return { tasks: tasks.rows, skills: skills.rows, bytes: taskBytes + skillBytes }
  }

  async checkTask(accountId: string, id: string, bytes: number, db: Db) {
    const usage = await this.usage(accountId, db)
    const current = usage.tasks.find((task) => task.source_task_id === id)
    if (!current && usage.tasks.length >= this.maxTasks) {
      throw new AppError(413, 'TASK_LIMIT_EXCEEDED', '云端任务数量已达上限')
    }
    const previous = current ? Buffer.byteLength(JSON.stringify(current.task_json), 'utf8') : 0
    if (usage.bytes - previous + bytes > this.maxBytes) {
      throw new AppError(413, 'METADATA_QUOTA_EXCEEDED', '云端元数据空间不足')
    }
  }

  async checkSkill(accountId: string, id: string, bytes: number, db: Db) {
    const usage = await this.usage(accountId, db)
    const current = usage.skills.find((skill) => skill.source_skill_id === id)
    if (!current && usage.skills.length >= this.maxSkills) {
      throw new AppError(413, 'SKILL_LIMIT_EXCEEDED', '云端 Skill 数量已达上限')
    }
    const previous = current ? Buffer.byteLength(current.markdown, 'utf8') : 0
    if (usage.bytes - previous + bytes > this.maxBytes) {
      throw new AppError(413, 'METADATA_QUOTA_EXCEEDED', '云端元数据空间不足')
    }
  }
}
