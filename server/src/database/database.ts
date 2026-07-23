import pg from 'pg'

import type { QueryResult, QueryResultRow } from 'pg'

export interface Db {
  query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>>
}

export interface TransactionalDb extends Db {
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>
}

export class Database implements TransactionalDb {
  readonly pool: pg.Pool

  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url })
  }

  query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
    return this.pool.query<R>(sql, values)
  }

  async tx<T>(fn: (db: Db) => Promise<T>) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  async close() {
    await this.pool.end()
  }
}
