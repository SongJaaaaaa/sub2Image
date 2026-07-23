import type { FastifyInstance } from 'fastify'

import type { TaskAssetRef } from '../../types.js'
import type { TaskService } from './taskService.js'

type PutTaskBody = {
  task: Record<string, unknown>
  assets: TaskAssetRef[]
}

const refSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['assetId', 'role', 'index'],
  properties: {
    assetId: { type: 'string', minLength: 1, maxLength: 300 },
    role: { enum: ['input', 'output', 'mask', 'original', 'video', 'poster', 'thumbnail'] },
    index: { type: 'integer', minimum: 0, maximum: 2147483647 }
  }
} as const

export function registerTaskRoutes(
  app: FastifyInstance,
  tasks: TaskService,
  maxTaskSize: number,
  maxAssets: number
) {
  app.get('/api/tasks', async (req) => ({ data: await tasks.list(req.accountId) }))

  app.put<{ Params: { id: string }; Body: PutTaskBody }>('/api/tasks/:id', {
    bodyLimit: maxTaskSize + 64 * 1024,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['task', 'assets'],
        properties: {
          task: {
            type: 'object',
            additionalProperties: true,
            required: ['id'],
            properties: { id: { type: 'string', minLength: 1, maxLength: 200 } }
          },
          assets: { type: 'array', maxItems: maxAssets, items: refSchema }
        }
      }
    }
  }, async (req) => ({
    data: await tasks.put(req.accountId, req.params.id, req.body.task, req.body.assets)
  }))

  app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (req) => {
    await tasks.delete(req.accountId, req.params.id)
    return { data: { deleted: true } }
  })
}
