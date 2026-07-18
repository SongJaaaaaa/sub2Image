// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FavoriteCollection, TaskRecord } from '../../src/types'
import { DEFAULT_PARAMS } from '../../src/types'

const mocks = vi.hoisted(() => ({
  deleteFavoriteCollection: vi.fn(async () => {}),
  removeMultipleTasks: vi.fn(),
  downloadImageEntriesAsZip: vi.fn(async () => ({ successCount: 1, failCount: 0 })),
  downloadImageIds: vi.fn(async () => ({ successCount: 1, failCount: 0 })),
}))

vi.mock('../../src/store', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/store')>(),
  deleteFavoriteCollection: mocks.deleteFavoriteCollection,
  removeMultipleTasks: mocks.removeMultipleTasks,
}))

vi.mock('../../src/lib/downloadImages', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/lib/downloadImages')>(),
  downloadImageEntriesAsZip: mocks.downloadImageEntriesAsZip,
  downloadImageIds: mocks.downloadImageIds,
  formatExportFileTime: () => 'test-time',
}))

import { useStore } from '../../src/store'
import GallerySelectionActionBar from '../../src/components/GallerySelectionActionBar'

const initialState = useStore.getState()

function task(id: string, prompt: string, values: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    prompt,
    params: { ...DEFAULT_PARAMS },
    inputImageIds: [],
    outputImages: [`${id}-image`],
    status: 'done',
    error: null,
    createdAt: Date.now(),
    finishedAt: Date.now(),
    elapsed: 100,
    ...values,
  }
}

const collectionA: FavoriteCollection = {
  id: 'collection-a',
  name: '收藏一',
  createdAt: 1,
  updatedAt: 1,
}

const collectionB: FavoriteCollection = {
  id: 'collection-b',
  name: '收藏二',
  createdAt: 2,
  updatedAt: 2,
}

beforeEach(() => {
  useStore.setState(initialState, true)
  mocks.deleteFavoriteCollection.mockClear()
  mocks.removeMultipleTasks.mockClear()
  mocks.downloadImageEntriesAsZip.mockClear()
  mocks.downloadImageIds.mockClear()
})

afterEach(cleanup)

describe('GallerySelectionActionBar', () => {
  it('只对当前可见任务执行全选和反选，并保留隐藏选择', async () => {
    const visible = task('visible', '可见任务', { createdAt: 3 })
    const hiddenBySearch = task('hidden-search', '其他任务', { createdAt: 2 })
    const hiddenByStatus = task('hidden-error', '可见但失败', { status: 'error', error: '失败', createdAt: 1 })
    useStore.setState({
      tasks: [hiddenByStatus, hiddenBySearch, visible],
      filterStatus: 'done',
      searchQuery: '可见',
      selectedTaskIds: [hiddenBySearch.id],
    })
    const user = userEvent.setup()
    render(<GallerySelectionActionBar />)

    await user.click(screen.getByRole('button', { name: '全选任务' }))
    expect(useStore.getState().selectedTaskIds).toEqual([visible.id])

    act(() => useStore.getState().setSelectedTaskIds([visible.id, hiddenBySearch.id]))
    await user.click(screen.getByRole('button', { name: '反选任务' }))
    expect(useStore.getState().selectedTaskIds).toEqual([hiddenBySearch.id])

    await user.click(screen.getByRole('button', { name: '编辑收藏夹' }))
    expect(useStore.getState().favoritePickerTaskIds).toEqual([hiddenBySearch.id])
  })

  it('下载选中任务后保留原文件名、提示和清理选择语义', async () => {
    const selected = task('task-a', '任务 A')
    const showToast = vi.fn()
    useStore.setState({
      tasks: [selected],
      selectedTaskIds: [selected.id],
      showToast,
      settings: { ...initialState.settings, zipDownloadRoutes: [] },
    })
    const user = userEvent.setup()
    render(<GallerySelectionActionBar />)

    await user.click(screen.getByRole('button', { name: '下载选中' }))

    await waitFor(() => expect(mocks.downloadImageIds).toHaveBeenCalledWith([`${selected.id}-image`], 'batch-test-time'))
    expect(showToast).toHaveBeenCalledWith('下载成功', 'success')
    expect(useStore.getState().selectedTaskIds).toEqual([])
  })

  it('批量删除任务继续使用原确认框和打开时的选择快照', async () => {
    const selected = task('task-a', '任务 A')
    useStore.setState({ tasks: [selected], selectedTaskIds: [selected.id] })
    const user = userEvent.setup()
    render(<GallerySelectionActionBar />)

    await user.click(screen.getByRole('button', { name: '删除选中' }))
    const dialog = useStore.getState().confirmDialog
    expect(dialog).toMatchObject({
      title: '批量删除',
      message: '确定要删除选中的 1 个任务吗？',
    })

    act(() => useStore.getState().setSelectedTaskIds([]))
    dialog?.action()
    expect(mocks.removeMultipleTasks).toHaveBeenCalledWith([selected.id])
  })

  it('收藏夹总览优先显示收藏夹操作，并保持下载与删除语义', async () => {
    const selected = task('task-a', '任务 A', {
      isFavorite: true,
      favoriteCollectionIds: [collectionA.id],
    })
    const showToast = vi.fn()
    useStore.setState({
      tasks: [selected],
      favoriteCollections: [collectionA, collectionB],
      filterFavorite: true,
      activeFavoriteCollectionId: null,
      selectedTaskIds: [selected.id],
      selectedFavoriteCollectionIds: [collectionA.id],
      showToast,
      settings: { ...initialState.settings, zipDownloadRoutes: ['favorite-collection-selection'] },
    })
    const user = userEvent.setup()
    render(<GallerySelectionActionBar />)

    expect(screen.getByRole('button', { name: '全选收藏夹' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '全选任务' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '下载选中' }))
    await waitFor(() => expect(mocks.downloadImageEntriesAsZip).toHaveBeenCalledWith(
      [expect.objectContaining({ imageId: `${selected.id}-image` })],
      'favorites-收藏一-test-time',
    ))
    expect(showToast).toHaveBeenCalledWith('下载成功：1 张图片', 'success')
    expect(useStore.getState().selectedFavoriteCollectionIds).toEqual([])

    act(() => useStore.getState().setSelectedFavoriteCollectionIds([collectionA.id]))
    await user.click(screen.getByRole('button', { name: '删除选中' }))
    const dialog = useStore.getState().confirmDialog
    expect(dialog).toMatchObject({
      title: '批量删除收藏夹',
      message: '确定要删除选中的 1 个收藏夹吗？',
      checkbox: {
        label: '同时删除收藏夹中的图片（1 张）',
        tone: 'danger',
      },
    })

    await act(async () => {
      await dialog?.action(true)
    })
    expect(mocks.deleteFavoriteCollection).toHaveBeenCalledWith(collectionA.id, true)
    expect(useStore.getState().selectedFavoriteCollectionIds).toEqual([])
  })

  it('没有选择时不渲染操作栏，删除全部真实收藏夹时保留原提示', async () => {
    const showToast = vi.fn()
    useStore.setState({
      favoriteCollections: [collectionA],
      filterFavorite: true,
      activeFavoriteCollectionId: null,
      selectedFavoriteCollectionIds: [],
      showToast,
    })
    const user = userEvent.setup()
    const view = render(<GallerySelectionActionBar />)

    expect(view.container.innerHTML).toBe('')

    act(() => useStore.getState().setSelectedFavoriteCollectionIds([collectionA.id]))
    await user.click(screen.getByRole('button', { name: '删除选中' }))
    expect(showToast).toHaveBeenCalledWith('至少保留一个收藏夹', 'error')
    expect(useStore.getState().confirmDialog).toBeNull()
  })

  it('InputBar 不再订阅画廊批量状态', () => {
    const source = readFileSync(resolve('src/components/InputBar.tsx'), 'utf8')
    const selectors = [
      'selectedTaskIds',
      'selectedFavoriteCollectionIds',
      'favoriteCollections',
      'filterStatus',
      'filterFavorite',
      'activeFavoriteCollectionId',
      'searchQuery',
    ]

    selectors.forEach((name) => {
      expect(source).not.toContain(`useStore((s) => s.${name})`)
    })
    expect(source).not.toContain("from './input/inputBatchBars'")
    expect(source).toContain('collectAgentRoundOutputImageSlots(round, tasks)')
  })
})
