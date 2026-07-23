import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRecord } from '../../types'

const mock = vi.hoisted(() => ({
  store: {
    tasks: [] as TaskRecord[],
    defaultFavoriteCollectionId: null as string | null,
    setTasks: vi.fn(),
  },
  autoSaveTaskToCloud: vi.fn(),
  putTask: vi.fn(),
  maybeOpenSupportPrompt: vi.fn(),
}))

vi.mock('../../state/appStore', () => ({
  useStore: Object.assign(vi.fn(), { getState: () => mock.store }),
}))

vi.mock('../favorites/favoriteTaskState', () => ({
  normalizeFavoritePatch: (_task: TaskRecord, patch: Partial<TaskRecord>) => patch,
}))

vi.mock('../cloud', () => ({ autoSaveTaskToCloud: mock.autoSaveTaskToCloud }))
vi.mock('./taskPersistence', () => ({ putTask: mock.putTask }))
vi.mock('./taskSupportPrompt', () => ({ maybeOpenSupportPrompt: mock.maybeOpenSupportPrompt }))

function task(): TaskRecord {
  return {
    id: 'task-1',
    prompt: 'test',
    params: {} as TaskRecord['params'],
    inputImageIds: [],
    outputImages: [],
    status: 'running',
    error: null,
    createdAt: 1,
    finishedAt: null,
    elapsed: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.store.tasks = [task()]
  mock.store.setTasks.mockImplementation((tasks) => {
    mock.store.tasks = tasks
  })
  mock.putTask.mockResolvedValue(undefined)
  mock.autoSaveTaskToCloud.mockResolvedValue(undefined)
})

describe('updateTaskInStore', () => {
  it('持久化完成任务后再触发自动保存', async () => {
    const calls: string[] = []
    mock.putTask.mockImplementation(async () => {
      calls.push('persist')
    })
    mock.autoSaveTaskToCloud.mockImplementation(async () => {
      calls.push('auto-save')
    })

    const { updateTaskInStore } = await import('./taskActions')
    await updateTaskInStore('task-1', { status: 'done' })

    expect(calls).toEqual(['persist', 'auto-save'])
  })

  it('流式完成回调可以抑制提前自动保存', async () => {
    const { updateTaskInStore } = await import('./taskActions')
    await updateTaskInStore('task-1', { status: 'done' }, { autoSave: false })

    expect(mock.putTask).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }))
    expect(mock.autoSaveTaskToCloud).not.toHaveBeenCalled()
  })
})
