import { indexedDB } from 'fake-indexeddb'
import { afterEach, describe, expect, it } from 'vitest'

import type { PromptProject, PromptSourceAsset } from '../types'
import {
  closePromptStudioDatabase,
  openPromptStudioDatabase,
  PROMPT_PROJECTS_STORE,
  PromptStudioIndexedDbError,
  toPromptStudioIndexedDbError,
  waitForPromptStudioTransaction,
  type PromptStudioIndexedDbOptions,
} from '../adapters/indexedDb'
import { createIndexedDbAssets } from '../adapters/indexedDbAssets'
import { createIndexedDbStorage } from '../adapters/indexedDbStorage'
import { PROMPT_REQUEST_INTERRUPTED_MESSAGE } from '../core/persistence'

const opened: PromptStudioIndexedDbOptions[] = []
let nextId = 0

afterEach(async () => {
  await Promise.all(opened.splice(0).map(closePromptStudioDatabase))
})

describe('default IndexedDB storage', () => {
  it('stores projects, sorts the list and restores the latest project for a conversation', async () => {
    const opts = createOptions()
    const storage = createIndexedDbStorage(opts)
    const old = createProject({ id: 'old', updatedAt: 10 })
    const latest = createProject({ id: 'latest', updatedAt: 30 })
    const other = createProject({ id: 'other', conversationId: 'conversation-2', updatedAt: 20 })

    await storage.put(old)
    await storage.put(latest)
    await storage.put(other)

    await expect(storage.list()).resolves.toEqual([latest, other, old])
    await expect(storage.get('old')).resolves.toEqual(old)
    await expect(storage.get('missing')).resolves.toBeNull()
    await expect(storage.getByConversationId('conversation-1')).resolves.toEqual(latest)
    await expect(storage.getByConversationId('missing')).resolves.toBeNull()

    await storage.delete('latest')
    await expect(storage.get('latest')).resolves.toBeNull()
    await expect(storage.getByConversationId('conversation-1')).resolves.toEqual(old)
  })

  it('recovers an interrupted project when reading it back', async () => {
    const opts = createOptions()
    const storage = createIndexedDbStorage(opts)
    const project = createProject({ phase: 'generating' })

    await storage.put(project)
    const restored = await storage.get(project.id)

    expect(restored?.phase).toBe('error')
    expect(restored?.messages[restored.messages.length - 1]?.content).toBe(PROMPT_REQUEST_INTERRUPTED_MESSAGE)
  })

  it('rejects an aborted transaction instead of reporting success', async () => {
    const opts = createOptions()
    const db = await openPromptStudioDatabase(opts)
    const tx = db.transaction(PROMPT_PROJECTS_STORE, 'readwrite')
    tx.objectStore(PROMPT_PROJECTS_STORE).put(createProject())
    const result = waitForPromptStudioTransaction(tx, () => undefined)

    tx.abort()

    await expect(result).rejects.toMatchObject({ code: 'aborted' })
  })

  it('reports a blocked upgrade and closes on versionchange', async () => {
    const blockedOpts = createOptions(2)
    const blocker = await openRawDatabase(blockedOpts.dbName!, 1)
    const blocked = createIndexedDbStorage(blockedOpts).list()

    await expect(blocked).rejects.toMatchObject({
      code: 'blocked',
      message: expect.stringContaining('其他标签页'),
    })
    blocker.close()

    const versionOpts = createOptions(1)
    await createIndexedDbStorage(versionOpts).list()
    const upgraded = await openRawDatabase(versionOpts.dbName!, 2)
    upgraded.close()
    opened.push({ ...versionOpts, version: 2 })

    await expect(createIndexedDbStorage({ ...versionOpts, version: 2 }).list()).resolves.toEqual([])
  })

  it('maps quota, abort and version failures to explicit errors', () => {
    expect(toPromptStudioIndexedDbError(
      new DOMException('full', 'QuotaExceededError'),
      'transaction',
    )).toMatchObject({ code: 'quota', message: '提示词工作台存储空间不足' })
    expect(toPromptStudioIndexedDbError(
      new DOMException('stopped', 'AbortError'),
      'transaction',
    )).toMatchObject({ code: 'aborted' })
    expect(toPromptStudioIndexedDbError(
      new DOMException('newer', 'VersionError'),
      'open',
    )).toMatchObject({ code: 'version' })
    expect(toPromptStudioIndexedDbError(new Error('failed'), 'open'))
      .toBeInstanceOf(PromptStudioIndexedDbError)
  })
})

describe('default IndexedDB assets', () => {
  it('shares the project database and only deletes unreferenced assets', async () => {
    const opts = createOptions()
    const storage = createIndexedDbStorage(opts)
    const assets = createIndexedDbAssets(opts)
    const asset: PromptSourceAsset = {
      id: 'asset-1',
      type: 'image',
      dataUrl: 'data:image/png;base64,AAAA',
      label: '主体参考',
      role: 'subject',
    }

    await expect(assets.save(asset)).resolves.toEqual({
      id: 'asset-1',
      type: 'image',
      label: '主体参考',
      role: 'subject',
    })
    await expect(assets.resolve(asset.id)).resolves.toBe(asset.dataUrl)

    await storage.put(createProject({
      source: {
        type: 'text',
        assets: [{ id: asset.id, type: 'image', label: asset.label, role: asset.role }],
      },
    }))
    await assets.deleteIfUnused(asset.id)
    await expect(assets.resolve(asset.id)).resolves.toBe(asset.dataUrl)

    await storage.delete('project-1')
    await assets.deleteIfUnused(asset.id)
    await expect(assets.resolve(asset.id)).resolves.toBeNull()
  })

  it('does not persist a data URL in the returned asset reference', async () => {
    const opts = createOptions()
    const assets = createIndexedDbAssets(opts)
    const ref = await assets.save({
      id: 'asset-1',
      type: 'image',
      dataUrl: 'data:image/png;base64,SECRET',
      label: '参考图',
    })

    expect(JSON.stringify(ref)).not.toContain('dataUrl')
    expect(JSON.stringify(ref)).not.toContain('SECRET')
  })
})

function createOptions(version = 1): PromptStudioIndexedDbOptions {
  const opts = {
    dbName: `prompt-studio-test-${++nextId}`,
    version,
    factory: indexedDB,
  }
  opened.push(opts)
  return opts
}

function createProject(changes: Partial<PromptProject> = {}): PromptProject {
  return {
    id: 'project-1',
    conversationId: 'conversation-1',
    domain: 'image',
    title: '项目',
    source: { type: 'text' },
    brief: { domain: 'image', fields: {} },
    messages: [],
    pendingConflicts: [],
    versions: [],
    phase: 'interview',
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    ...changes,
  }
}

function openRawDatabase(name: string, version: number) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, version)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
