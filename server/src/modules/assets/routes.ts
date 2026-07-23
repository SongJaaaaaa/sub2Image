import type { FastifyInstance } from 'fastify'

import type { TransactionalDb } from '../../database/database.js'
import { AppError } from '../../errors.js'
import type { StorageCleanupService } from '../../storage/storageCleanupService.js'
import type { StorageDriver } from '../../storage/storageDriver.js'
import type { TaskService } from '../tasks/taskService.js'
import type { AssetService } from './assetService.js'

const uuidParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } }
} as const

export function parseRange(value: string | undefined, size: number) {
  if (!value) return null
  const match = value.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || (!match[1] && !match[2])) {
    throw new AppError(416, 'INVALID_RANGE', '请求范围无效')
  }

  const suffix = !match[1]
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1])
  const end = suffix || !match[2] ? size - 1 : Math.min(Number(match[2]), size - 1)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
    throw new AppError(416, 'INVALID_RANGE', '请求范围无效')
  }
  return { start, end }
}

export function registerAssetRoutes(
  app: FastifyInstance,
  deps: {
    db: TransactionalDb
    assets: AssetService
    tasks: TaskService
    cleanup: StorageCleanupService
    storage: StorageDriver
  }
) {
  app.get<{ Params: { id: string } }>('/api/assets/:id/content', {
    schema: { params: uuidParams }
  }, async (req, reply) => {
    const asset = await deps.assets.getById(req.accountId, req.params.id)
    const size = Number(asset.byte_size)
    const range = parseRange(req.headers.range, size)
    const stream = await deps.storage.open(asset.object_key, range ?? undefined)

    reply.header('Content-Type', asset.mime_type)
    reply.header('Accept-Ranges', 'bytes')
    reply.header('Cache-Control', 'private, max-age=3600')
    reply.header('X-Content-Type-Options', 'nosniff')
    if (range) {
      reply.code(206)
      reply.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
      reply.header('Content-Length', range.end - range.start + 1)
    } else {
      reply.header('Content-Length', size)
    }
    return reply.send(stream)
  })

  app.delete<{ Params: { id: string } }>('/api/assets/:id', {
    schema: { params: uuidParams }
  }, async (req) => {
    const key = await deps.db.tx(async (tx) => {
      const asset = await deps.assets.findById(req.accountId, req.params.id, tx, true)
      if (!asset) return null
      if (await deps.tasks.hasAssetRefs(asset.id, tx)) {
        throw new AppError(409, 'ASSET_IN_USE', '资源仍被云端任务引用')
      }
      await deps.cleanup.enqueue(asset.object_key, tx)
      await deps.assets.remove(req.accountId, asset.id, tx)
      return asset.object_key
    })
    if (key) await deps.cleanup.flushKeys([key])
    return { data: { deleted: true } }
  })
}
