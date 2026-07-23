import { buildApp } from './app.js'
import { config } from './config.js'
import { Database } from './database/database.js'
import { migrate } from './database/migrate.js'
import { Sub2ApiAuthProvider } from './modules/auth/sub2ApiAuthProvider.js'
import { LocalStorageDriver } from './storage/localStorageDriver.js'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('缺少 DATABASE_URL')

  const db = new Database(url)
  await migrate(db)
  const storage = new LocalStorageDriver(config.dataDir)
  await storage.cleanupTempFiles()

  const app = buildApp({
    db,
    storage,
    auth: new Sub2ApiAuthProvider(
      config.sub2ApiUrl,
      config.authMePath,
      config.authTimeout
    ),
    logger: true
  })

  const close = async () => {
    await app.close()
    await db.close()
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)

  await app.listen({ host: '0.0.0.0', port: config.port })
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
