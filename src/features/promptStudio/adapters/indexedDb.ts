export const DEFAULT_PROMPT_STUDIO_DB_NAME = 'prompt-studio'
export const DEFAULT_PROMPT_STUDIO_DB_VERSION = 1
export const PROMPT_PROJECTS_STORE = 'promptProjects'
export const PROMPT_ASSETS_STORE = 'promptAssets'
export const PROMPT_PROJECT_CONVERSATION_INDEX = 'conversationId'

export type PromptStudioIndexedDbErrorCode =
  | 'blocked'
  | 'version'
  | 'quota'
  | 'aborted'
  | 'transaction'
  | 'open'

export class PromptStudioIndexedDbError extends Error {
  readonly code: PromptStudioIndexedDbErrorCode
  readonly originalError: unknown

  constructor(code: PromptStudioIndexedDbErrorCode, message: string, originalError?: unknown) {
    super(message)
    this.name = 'PromptStudioIndexedDbError'
    this.code = code
    this.originalError = originalError
  }
}

export type PromptStudioIndexedDbOptions = {
  dbName?: string
  version?: number
  factory?: IDBFactory
}

type ResolvedIndexedDbOptions = {
  dbName: string
  version: number
  factory: IDBFactory
}

const connections = new WeakMap<IDBFactory, Map<string, Promise<IDBDatabase>>>()

export function resolvePromptStudioIndexedDbOptions(
  opts: PromptStudioIndexedDbOptions = {},
): ResolvedIndexedDbOptions {
  return {
    dbName: opts.dbName ?? DEFAULT_PROMPT_STUDIO_DB_NAME,
    version: opts.version ?? DEFAULT_PROMPT_STUDIO_DB_VERSION,
    factory: opts.factory ?? indexedDB,
  }
}

export function openPromptStudioDatabase(
  opts: PromptStudioIndexedDbOptions = {},
): Promise<IDBDatabase> {
  const resolved = resolvePromptStudioIndexedDbOptions(opts)
  const cache = getConnectionCache(resolved.factory)
  const key = getConnectionKey(resolved)
  const current = cache.get(key)
  if (current) return current

  let settled = false
  let promise: Promise<IDBDatabase>
  promise = new Promise((resolve, reject) => {
    const req = resolved.factory.open(resolved.dbName, resolved.version)

    req.onupgradeneeded = () => {
      const db = req.result
      const projects = db.objectStoreNames.contains(PROMPT_PROJECTS_STORE)
        ? req.transaction!.objectStore(PROMPT_PROJECTS_STORE)
        : db.createObjectStore(PROMPT_PROJECTS_STORE, { keyPath: 'id' })
      if (!projects.indexNames.contains(PROMPT_PROJECT_CONVERSATION_INDEX)) {
        projects.createIndex(PROMPT_PROJECT_CONVERSATION_INDEX, 'conversationId')
      }
      if (!db.objectStoreNames.contains(PROMPT_ASSETS_STORE)) {
        db.createObjectStore(PROMPT_ASSETS_STORE, { keyPath: 'id' })
      }
    }
    req.onblocked = () => {
      settled = true
      if (cache.get(key) === promise) cache.delete(key)
      reject(new PromptStudioIndexedDbError(
        'blocked',
        '提示词工作台数据库升级被其他标签页阻塞，请关闭其他标签页后重试',
      ))
    }
    req.onerror = () => {
      settled = true
      if (cache.get(key) === promise) cache.delete(key)
      reject(toPromptStudioIndexedDbError(req.error, 'open'))
    }
    req.onsuccess = () => {
      if (settled) {
        req.result.close()
        return
      }
      settled = true
      const db = req.result
      db.onversionchange = () => {
        db.close()
        if (cache.get(key) === promise) cache.delete(key)
      }
      resolve(db)
    }
  })
  cache.set(key, promise)
  return promise
}

export async function closePromptStudioDatabase(opts: PromptStudioIndexedDbOptions = {}) {
  const resolved = resolvePromptStudioIndexedDbOptions(opts)
  const cache = connections.get(resolved.factory)
  const key = getConnectionKey(resolved)
  const promise = cache?.get(key)
  cache?.delete(key)
  if (!promise) return
  try {
    const db = await promise
    db.close()
  } catch {
    // 打开失败时连接已经不可用。
  }
}

export function waitForPromptStudioTransaction<T>(
  tx: IDBTransaction,
  getResult: () => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      try {
        resolve(getResult())
      } catch (err) {
        reject(toPromptStudioIndexedDbError(err, 'transaction'))
      }
    }
    tx.onerror = () => undefined
    tx.onabort = () => reject(toPromptStudioIndexedDbError(
      tx.error ?? new DOMException('事务已中止', 'AbortError'),
      'aborted',
    ))
  })
}

export function toPromptStudioIndexedDbError(
  err: unknown,
  fallback: PromptStudioIndexedDbErrorCode,
) {
  if (err instanceof PromptStudioIndexedDbError) return err
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'QuotaExceededError') {
    return new PromptStudioIndexedDbError('quota', '提示词工作台存储空间不足', err)
  }
  if (name === 'AbortError') {
    return new PromptStudioIndexedDbError('aborted', '提示词工作台数据库事务已中止', err)
  }
  if (name === 'VersionError') {
    return new PromptStudioIndexedDbError('version', '提示词工作台数据库版本不兼容', err)
  }
  return new PromptStudioIndexedDbError(
    fallback,
    `提示词工作台数据库操作失败：${err instanceof Error ? err.message : String(err ?? '未知错误')}`,
    err,
  )
}

function getConnectionCache(factory: IDBFactory) {
  const current = connections.get(factory)
  if (current) return current
  const cache = new Map<string, Promise<IDBDatabase>>()
  connections.set(factory, cache)
  return cache
}

function getConnectionKey(opts: ResolvedIndexedDbOptions) {
  return `${opts.dbName}:${opts.version}`
}
