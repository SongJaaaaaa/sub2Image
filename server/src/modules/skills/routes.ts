import type { FastifyInstance } from 'fastify'

import type { SkillService } from './skillService.js'

type PutSkillBody = {
  version: number
  fileName: string
  markdown: string
}

export function registerSkillRoutes(app: FastifyInstance, skills: SkillService, maxSkillSize: number) {
  app.get('/api/skills', async (req) => ({ data: await skills.list(req.accountId) }))

  app.put<{ Params: { id: string }; Body: PutSkillBody }>('/api/skills/:id', {
    bodyLimit: maxSkillSize * 6 + 1024,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['version', 'fileName', 'markdown'],
        properties: {
          version: { type: 'integer', minimum: 1, maximum: 2147483647 },
          fileName: { type: 'string', minLength: 1, maxLength: 255 },
          markdown: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (req) => ({
    data: await skills.put(
      req.accountId,
      req.params.id,
      req.body.version,
      req.body.fileName,
      req.body.markdown
    )
  }))

  app.delete<{ Params: { id: string } }>('/api/skills/:id', async (req) => {
    await skills.delete(req.accountId, req.params.id)
    return { data: { deleted: true } }
  })
}
