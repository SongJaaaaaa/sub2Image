import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PromptProject } from '../types'
import {
  migratePromptProject,
  PROMPT_REQUEST_INTERRUPTED_MESSAGE,
  recoverInterruptedPromptProject,
} from '../core/persistence'
import type { PromptStudioStorage } from '../ports/storage'
import {
  createPromptProjectPersistence,
  PROMPT_PROJECT_SAVE_DELAY_MS,
} from '../store/persistence'

afterEach(() => {
  vi.useRealTimers()
})

describe('prompt project migration', () => {
  it('migrates a project without schemaVersion to version 1 without changing the input', () => {
    const project = createProject({ phase: 'interview' })
    const { schemaVersion: _schemaVersion, ...legacy } = project

    const migrated = migratePromptProject(legacy)

    expect(migrated).toEqual(project)
    expect(legacy).not.toHaveProperty('schemaVersion')
  })

  it.each(['extracting', 'generating'] as const)(
    'recovers an interrupted %s project as a retryable error',
    (phase) => {
      const project = createProject({ phase, updatedAt: 25 })

      const recovered = migratePromptProject(project)

      expect(recovered.phase).toBe('error')
      expect(recovered.messages[recovered.messages.length - 1]).toMatchObject({
        role: 'assistant',
        content: PROMPT_REQUEST_INTERRUPTED_MESSAGE,
        createdAt: 25,
      })
      expect(project.phase).toBe(phase)
    },
  )

  it('does not duplicate the interrupted message after recovery', () => {
    const recovered = recoverInterruptedPromptProject(createProject({ phase: 'generating' }))

    expect(recoverInterruptedPromptProject(recovered)).toBe(recovered)
    expect(recovered.messages).toHaveLength(1)
  })

  it('removes external data URLs from stored asset references without changing the input', () => {
    const project = createProject({
      source: {
        type: 'text',
        assets: [{
          id: 'asset-1',
          type: 'image',
          label: '主体参考',
          role: 'subject',
          width: 1200,
          height: 800,
          dataUrl: 'data:image/png;base64,SECRET',
        }],
      } as unknown as PromptProject['source'],
    })

    const migrated = migratePromptProject(project)

    expect(migrated.source.assets).toEqual([{
      id: 'asset-1',
      type: 'image',
      label: '主体参考',
      role: 'subject',
      width: 1200,
      height: 800,
    }])
    expect(JSON.stringify(migrated)).not.toContain('dataUrl')
    expect(JSON.stringify(project)).toContain('SECRET')
  })

  it('rejects unsupported or incomplete project data', () => {
    expect(() => migratePromptProject({ schemaVersion: 2 })).toThrow('不支持的提示词项目版本')
    expect(() => migratePromptProject({ schemaVersion: 1 })).toThrow('缺少必要字段')
  })
})

describe('prompt project persistence coordinator', () => {
  it('merges text edits into one write after 400ms', async () => {
    vi.useFakeTimers()
    const { storage, put } = createStorage()
    const persistence = createPromptProjectPersistence(storage)
    const first = createProject({ title: '第一次' })
    const latest = createProject({ title: '最后一次', updatedAt: 2 })

    persistence.schedule(first)
    await vi.advanceTimersByTimeAsync(PROMPT_PROJECT_SAVE_DELAY_MS - 1)
    expect(put).not.toHaveBeenCalled()

    persistence.schedule(latest)
    await vi.advanceTimersByTimeAsync(PROMPT_PROJECT_SAVE_DELAY_MS)
    await persistence.flush()

    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith(latest)
  })

  it('writes immediate changes and cancels the pending text write', async () => {
    vi.useFakeTimers()
    const { storage, put } = createStorage()
    const persistence = createPromptProjectPersistence(storage)
    const pending = createProject({ title: '编辑中' })
    const immediate = createProject({ title: '版本已保存', updatedAt: 2 })

    persistence.schedule(pending)
    await expect(persistence.save(immediate)).resolves.toBe(true)
    await vi.runAllTimersAsync()

    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith(immediate)
  })

  it('drops a late response by project, request and revision', async () => {
    const { storage, put } = createStorage()
    const persistence = createPromptProjectPersistence(storage)
    const first = persistence.startRequest('project-1', 'request-1')
    const current = persistence.startRequest('project-1', 'request-2')

    expect(first).toEqual({ projectId: 'project-1', requestId: 'request-1', revision: 1 })
    expect(current).toEqual({ projectId: 'project-1', requestId: 'request-2', revision: 2 })
    expect(persistence.isCurrentRequest(first)).toBe(false)
    expect(persistence.isCurrentRequest(current)).toBe(true)
    await expect(persistence.save(createProject({ title: '迟到结果' }), first)).resolves.toBe(false)
    await expect(persistence.save(createProject({ title: '当前结果' }), current)).resolves.toBe(true)

    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0]?.[0].title).toBe('当前结果')
  })

  it('invalidates a request without adding runtime tokens to the project', async () => {
    const { storage, put } = createStorage()
    const persistence = createPromptProjectPersistence(storage)
    const project = createProject()
    const token = persistence.startRequest(project.id, 'request-1')

    persistence.invalidateRequest(project.id)

    expect(persistence.isCurrentRequest(token)).toBe(false)
    await expect(persistence.save(project, token)).resolves.toBe(false)
    expect(put).not.toHaveBeenCalled()
    expect(JSON.stringify(project)).not.toContain('requestId')
    expect(JSON.stringify(project)).not.toContain('revision')
  })

  it('does not accept a current token for a different project', async () => {
    const { storage, put } = createStorage()
    const persistence = createPromptProjectPersistence(storage)
    const token = persistence.startRequest('project-1', 'request-1')

    await expect(persistence.save(createProject({ id: 'project-2' }), token)).resolves.toBe(false)

    expect(put).not.toHaveBeenCalled()
  })

  it('rechecks the token after an earlier write finishes', async () => {
    let release: () => void = () => {}
    const blocked = new Promise<void>((resolve) => {
      release = () => resolve()
    })
    let call = 0
    const { storage, put } = createStorage(async () => {
      call++
      if (call === 1) await blocked
    })
    const persistence = createPromptProjectPersistence(storage)
    const firstWrite = persistence.save(createProject({ title: '先前写入' }))
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    const token = persistence.startRequest('project-1', 'request-1')
    const responseWrite = persistence.save(createProject({ title: '迟到响应' }), token)

    persistence.startRequest('project-1', 'request-2')
    release()

    await firstWrite
    await expect(responseWrite).resolves.toBe(false)
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('keeps a pending local edit when a stale response is rejected', async () => {
    vi.useFakeTimers()
    const { storage, put } = createStorage()
    const persistence = createPromptProjectPersistence(storage)
    const stale = persistence.startRequest('project-1', 'request-1')
    persistence.startRequest('project-1', 'request-2')
    const local = createProject({ title: '本地编辑' })
    persistence.schedule(local)

    await expect(persistence.save(createProject({ title: '迟到响应' }), stale)).resolves.toBe(false)
    await vi.advanceTimersByTimeAsync(PROMPT_PROJECT_SAVE_DELAY_MS)
    await persistence.flush()

    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith(local)
  })

  it('flushes every pending project before disposal', async () => {
    vi.useFakeTimers()
    const { storage, put } = createStorage()
    const persistence = createPromptProjectPersistence(storage)
    persistence.schedule(createProject({ id: 'project-1' }))
    persistence.schedule(createProject({ id: 'project-2' }))

    await persistence.dispose()

    expect(put).toHaveBeenCalledTimes(2)
    await vi.runAllTimersAsync()
    expect(put).toHaveBeenCalledTimes(2)
  })

  it('reports a delayed write error without an unhandled rejection', async () => {
    vi.useFakeTimers()
    const err = new Error('保存失败')
    const onError = vi.fn()
    const { storage } = createStorage(async () => {
      throw err
    })
    const persistence = createPromptProjectPersistence(storage, { onError })

    persistence.schedule(createProject())
    await vi.advanceTimersByTimeAsync(PROMPT_PROJECT_SAVE_DELAY_MS)

    expect(onError).toHaveBeenCalledWith(err)
  })
})

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

function createStorage(putImpl: (project: PromptProject) => Promise<void> = async () => undefined) {
  const put = vi.fn(putImpl)
  const storage: PromptStudioStorage = {
    list: async () => [],
    get: async () => null,
    getByConversationId: async () => null,
    put,
    delete: async () => undefined,
  }
  return { storage, put }
}
