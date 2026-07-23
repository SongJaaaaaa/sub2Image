import type { Readable } from 'node:stream'

import type { FastifyInstance } from 'fastify'

import { AppError } from '../../errors.js'
import type { AssetMetadata } from '../../types.js'
import type { CreateUploadInput, UploadService } from './uploadService.js'

type CreateBody = Omit<CreateUploadInput, 'metadata'> & {
  metadata?: AssetMetadata
}

const uuidParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } }
} as const

export function registerUploadRoutes(
  app: FastifyInstance,
  uploads: UploadService,
  maxUploadSize: number,
  maxJsonSize: number
) {
  app.post<{ Body: CreateBody }>('/api/uploads', {
    bodyLimit: maxJsonSize,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['assetId', 'kind', 'mimeType', 'size', 'sha256'],
        properties: {
          assetId: { type: 'string', minLength: 1, maxLength: 300 },
          kind: { enum: ['image', 'video'] },
          mimeType: { type: 'string', minLength: 1, maxLength: 100 },
          size: { type: 'integer', minimum: 1 },
          sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          metadata: {
            type: 'object',
            additionalProperties: false,
            properties: {
              width: { type: 'number', minimum: 0 },
              height: { type: 'number', minimum: 0 },
              duration: { type: 'number', minimum: 0 },
              sourceId: { type: 'string', maxLength: 300 }
            }
          }
        }
      }
    }
  }, async (req) => ({
    data: await uploads.create(req.accountId, {
      ...req.body,
      metadata: req.body.metadata ?? {}
    })
  }))

  app.put<{ Params: { id: string } }>('/api/uploads/:id/content', {
    bodyLimit: maxUploadSize,
    schema: { params: uuidParams }
  }, async (req) => {
    const body = req.body as Readable
    if (!body || typeof body.pipe !== 'function') {
      throw new AppError(400, 'FILE_BODY_REQUIRED', '缺少文件内容')
    }
    const mimeType = req.headers['content-type']?.split(';', 1)[0]?.trim() ?? ''
    const length = req.headers['content-length']
    const contentLength = length === undefined ? undefined : Number(length)
    if (contentLength !== undefined && !Number.isSafeInteger(contentLength)) {
      throw new AppError(400, 'INVALID_CONTENT_LENGTH', 'Content-Length 无效')
    }
    return {
      data: await uploads.putContent(req.accountId, req.params.id, mimeType, body, contentLength)
    }
  })

  app.post<{ Params: { id: string } }>('/api/uploads/:id/complete', {
    schema: { params: uuidParams }
  }, async (req) => ({
    data: await uploads.complete(req.accountId, req.params.id)
  }))

  app.delete<{ Params: { id: string } }>('/api/uploads/:id', {
    schema: { params: uuidParams }
  }, async (req) => {
    await uploads.cancel(req.accountId, req.params.id)
    return { data: { deleted: true } }
  })
}
