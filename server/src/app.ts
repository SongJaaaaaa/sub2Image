import Fastify from 'fastify'
import multipart from '@fastify/multipart'

import { config, type CloudConfig } from './config.js'
import type { TransactionalDb } from './database/database.js'
import { AppError } from './errors.js'
import { AccountService } from './modules/account/accountService.js'
import { MetadataQuotaService } from './modules/account/metadataQuotaService.js'
import { registerAccountRoutes } from './modules/account/routes.js'
import type { AuthProvider } from './modules/auth/authProvider.js'
import { AssetService } from './modules/assets/assetService.js'
import { registerAssetRoutes } from './modules/assets/routes.js'
import { SkillService } from './modules/skills/skillService.js'
import { registerSkillRoutes } from './modules/skills/routes.js'
import { MediaService } from './modules/media/mediaService.js'
import type { MediaWorker } from './modules/media/mediaWorker.js'
import { SpeechWorkerClient } from './modules/media/mediaWorker.js'
import { registerMediaRoutes } from './modules/media/routes.js'
import { registerSyncRoutes } from './modules/sync/routes.js'
import { TaskService } from './modules/tasks/taskService.js'
import { registerTaskRoutes } from './modules/tasks/routes.js'
import { registerUploadRoutes } from './modules/uploads/routes.js'
import { hasActiveUploadObjectKey, UploadService } from './modules/uploads/uploadService.js'
import { StorageCleanupService } from './storage/storageCleanupService.js'
import type { StorageDriver } from './storage/storageDriver.js'

type AppOptions = {
  db: TransactionalDb
  storage: StorageDriver
  auth: AuthProvider
  cfg?: CloudConfig
  logger?: boolean
  mediaWorker?: MediaWorker
  mediaJobsDir?: string
}

export function buildApp(opts: AppOptions) {
  const cfg = opts.cfg ?? config
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: cfg.maxVideoSize,
    trustProxy: 1
  })

  app.decorateRequest('authUser', null)
  app.decorateRequest('accountId', '')
  app.register(multipart, {
    limits: { files: 1, fields: 1, fileSize: cfg.maxVideoSize }
  })
  app.addContentTypeParser(
    [...cfg.allowedImageTypes, ...cfg.allowedVideoTypes],
    (req, payload, done) => done(null, payload)
  )

  const accounts = new AccountService(opts.db)
  const metadataQuota = new MetadataQuotaService(
    cfg.maxMetadataSize,
    cfg.maxTaskCount,
    cfg.maxSkillCount
  )
  const assets = new AssetService(opts.db)
  const cleanup = new StorageCleanupService(
    opts.db,
    opts.storage,
    async (key, db) => await assets.hasObjectKey(key, db) || await hasActiveUploadObjectKey(key, db)
  )
  const tasks = new TaskService(
    opts.db,
    assets,
    cleanup,
    accounts,
    metadataQuota,
    cfg.maxTaskSize,
    cfg.maxTaskAssets
  )
  const skills = new SkillService(opts.db, accounts, metadataQuota, cfg.maxSkillSize)
  const uploads = new UploadService(opts.db, opts.storage, cleanup, assets, accounts, cfg)
  const media = new MediaService(
    opts.db,
    opts.mediaWorker ?? new SpeechWorkerClient(cfg.speechWorkerUrl),
    opts.mediaJobsDir ?? cfg.mediaJobsDir,
    cfg.mediaJobTtl,
    cfg.voiceCacheTtl,
    cfg.maxTtsChars,
    cfg.maxVideoSize,
    cfg.maxVideoDuration,
    cfg.allowedVideoTypes
  )

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return
    const user = await opts.auth.verify({
      authorization: req.headers.authorization,
      userAgent: req.headers['user-agent'],
      ip: req.ip
    })
    req.authUser = user
    req.accountId = (await accounts.ensure(user)).id
  })
  const maintain = async () => {
    await uploads.expire()
    await cleanup.flush()
    await media.expire()
  }
  app.addHook('onReady', async () => {
    await maintain()
    await media.start()
  })
  const cleanupTimer = setInterval(() => {
    maintain().catch((err) => app.log.error({ err }, '云端存储维护失败'))
  }, cfg.cleanupInterval)
  cleanupTimer.unref()
  app.addHook('onClose', async () => {
    clearInterval(cleanupTimer)
    media.close()
  })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.status === 416) reply.header('Content-Range', 'bytes */*')
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } })
    }

    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: '请求参数无效' }
      })
    }

    const status = (err as { statusCode?: number }).statusCode
    if (status && status >= 400 && status < 500) {
      const code = status === 400
        ? 'BAD_REQUEST'
        : status === 413
          ? 'PAYLOAD_TOO_LARGE'
          : status === 415
            ? 'UNSUPPORTED_MEDIA_TYPE'
            : 'REQUEST_ERROR'
      const message = status === 400
        ? '请求内容无效'
        : status === 413
          ? '请求内容超过允许大小'
          : status === 415
            ? '不支持该请求类型'
            : '请求无法处理'
      return reply.code(status).send({ error: { code, message } })
    }

    req.log.error({ err }, '请求处理失败')
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' }
    })
  })

  app.get('/health', async () => {
    await opts.db.query('SELECT 1')
    return { data: { status: 'ok' } }
  })
  registerAccountRoutes(app, accounts, assets, cfg)
  registerUploadRoutes(app, uploads, cfg.maxVideoSize, cfg.maxTaskSize)
  registerTaskRoutes(app, tasks, cfg.maxTaskSize, cfg.maxTaskAssets)
  registerAssetRoutes(app, { db: opts.db, assets, tasks, cleanup, storage: opts.storage })
  registerSkillRoutes(app, skills, cfg.maxSkillSize)
  registerSyncRoutes(app, { accounts, assets, tasks, skills, cfg })
  registerMediaRoutes(app, media, cfg.maxVideoSize)

  return app
}
