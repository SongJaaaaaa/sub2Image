import type { FastifyInstance } from 'fastify'

import { AppError } from '../../errors.js'
import type { MediaService } from './mediaService.js'
import type { TtsInput } from './mediaWorker.js'

const uuidParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } }
} as const

const ttsBody = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'voice', 'rate', 'pitch', 'volume'],
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 5000 },
    voice: { type: 'string', minLength: 1, maxLength: 200 },
    rate: { type: 'integer', minimum: -50, maximum: 100 },
    pitch: { type: 'integer', minimum: -50, maximum: 50 },
    volume: { type: 'integer', minimum: -50, maximum: 100 }
  }
} as const

export function registerMediaRoutes(app: FastifyInstance, media: MediaService, maxVideoSize: number) {
  app.get('/api/media/voices', async () => ({ data: await media.listVoices() }))

  app.post<{ Body: TtsInput }>('/api/media/tts', {
    bodyLimit: 32 * 1024,
    schema: { body: ttsBody }
  }, async (req, reply) => {
    const stream = await media.synthesize(req.body)
    return reply
      .type('audio/mpeg')
      .header('Content-Disposition', 'attachment; filename="speech.mp3"')
      .send(stream)
  })

  app.post('/api/media/transcriptions', async (req, reply) => {
    await media.ensureAvailable()
    const part = await req.file({ limits: { fileSize: maxVideoSize, files: 1, fields: 1 } })
    if (!part) throw new AppError(400, 'FILE_BODY_REQUIRED', '请选择视频文件')
    const field = part.fields.language
    const language = field && !Array.isArray(field) && field.type === 'field'
      ? String(field.value)
      : undefined
    const data = await media.createTranscription(req.accountId, {
      stream: part.file,
      fileName: part.filename,
      mimeType: part.mimetype,
      language: language || undefined
    })
    return reply.code(202).send({ data })
  })

  app.get<{ Params: { id: string } }>('/api/media/transcriptions/:id', {
    schema: { params: uuidParams }
  }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store')
    return { data: await media.getTranscription(req.accountId, req.params.id) }
  })

  app.delete<{ Params: { id: string } }>('/api/media/transcriptions/:id', {
    schema: { params: uuidParams }
  }, async (req) => {
    await media.cancelTranscription(req.accountId, req.params.id)
    return { data: { deleted: true } }
  })
}
