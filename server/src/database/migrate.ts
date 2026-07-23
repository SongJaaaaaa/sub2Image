import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { Database, type TransactionalDb } from './database.js'

export async function migrate(db: TransactionalDb) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS cloud_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const dir = fileURLToPath(new URL('../../migrations/', import.meta.url))
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()

  for (const file of files) {
    const found = await db.query('SELECT 1 FROM cloud_migrations WHERE name = $1', [file])
    if (found.rowCount) continue

    const sql = await readFile(new URL(`../../migrations/${file}`, import.meta.url), 'utf8')
    await db.tx(async (tx) => {
      await tx.query(sql)
      await tx.query('INSERT INTO cloud_migrations (name) VALUES ($1)', [file])
    })
  }
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('缺少 DATABASE_URL')

  const db = new Database(url)
  try {
    await migrate(db)
  } finally {
    await db.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
