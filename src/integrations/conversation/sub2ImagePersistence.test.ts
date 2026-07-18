import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromptProject, PromptSourceAsset } from '../../features/promptStudio'

const mocks = vi.hoisted(() => ({
  getAllPromptProjects: vi.fn(),
  getPromptProject: vi.fn(),
  getPromptProjectByConversationId: vi.fn(),
  putPromptProject: vi.fn(),
  deletePromptProject: vi.fn(),
  storeImageWithSize: vi.fn(),
  ensureImageCached: vi.fn(),
  deleteImageIfUnreferenced: vi.fn(),
}))

vi.mock('../../lib/db', () => ({
  getAllPromptProjects: mocks.getAllPromptProjects,
  getPromptProject: mocks.getPromptProject,
  getPromptProjectByConversationId: mocks.getPromptProjectByConversationId,
  putPromptProject: mocks.putPromptProject,
  deletePromptProject: mocks.deletePromptProject,
  storeImageWithSize: mocks.storeImageWithSize,
}))

vi.mock('../../store', () => ({
  ensureImageCached: mocks.ensureImageCached,
  deleteImageIfUnreferenced: mocks.deleteImageIfUnreferenced,
}))

import { sub2ImageAssets } from './sub2ImageAssets'
import { sub2ImageStorage } from './sub2ImageStorage'

const project: PromptProject = {
  id: 'project-1',
  conversationId: 'conversation-1',
  domain: 'image',
  title: '海报项目',
  source: { type: 'text', text: '制作海报' },
  brief: { domain: 'image', fields: {} },
  messages: [],
  pendingConflicts: [],
  versions: [],
  phase: 'interview',
  schemaVersion: 1,
  createdAt: 1,
  updatedAt: 2,
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
})

describe('sub2ImageStorage', () => {
  it('maps every Prompt Studio storage operation to the host database', async () => {
    mocks.getAllPromptProjects.mockResolvedValue([project])
    mocks.getPromptProject.mockResolvedValue(project)
    mocks.getPromptProjectByConversationId.mockResolvedValue(project)
    mocks.putPromptProject.mockResolvedValue(project.id)
    mocks.deletePromptProject.mockResolvedValue(undefined)

    await expect(sub2ImageStorage.list()).resolves.toEqual([project])
    await expect(sub2ImageStorage.get(project.id)).resolves.toEqual(project)
    await expect(sub2ImageStorage.getByConversationId(project.conversationId!)).resolves.toEqual(project)
    await expect(sub2ImageStorage.put(project)).resolves.toBeUndefined()
    await expect(sub2ImageStorage.delete(project.id)).resolves.toBeUndefined()

    expect(mocks.getPromptProject).toHaveBeenCalledWith(project.id)
    expect(mocks.getPromptProjectByConversationId).toHaveBeenCalledWith(project.conversationId)
    expect(mocks.putPromptProject).toHaveBeenCalledWith(project)
    expect(mocks.deletePromptProject).toHaveBeenCalledWith(project.id)
  })

  it('persists interrupted-request recovery when loading a project', async () => {
    mocks.getPromptProject.mockResolvedValue({ ...project, phase: 'generating' })
    mocks.putPromptProject.mockResolvedValue(project.id)

    const restored = await sub2ImageStorage.get(project.id)

    expect(restored).toMatchObject({ phase: 'error' })
    expect(restored?.messages[0]?.content).toBe('上次请求已中断，可重试')
    expect(mocks.putPromptProject).toHaveBeenCalledWith(restored)
  })
})

describe('sub2ImageAssets', () => {
  const asset: PromptSourceAsset = {
    id: 'source-asset',
    type: 'image',
    dataUrl: 'data:image/png;base64,abc',
    label: '主体参考',
    role: 'subject',
  }

  it('stores uploads and returns metadata without the data URL', async () => {
    mocks.storeImageWithSize.mockResolvedValue({ id: 'stored-asset', width: 1200, height: 800 })

    await expect(sub2ImageAssets.save(asset)).resolves.toEqual({
      id: 'stored-asset',
      type: 'image',
      label: '主体参考',
      role: 'subject',
      width: 1200,
      height: 800,
    })
    expect(mocks.storeImageWithSize).toHaveBeenCalledWith(asset.dataUrl, 'upload')
  })

  it('resolves cached images and forwards unused-image deletion', async () => {
    mocks.ensureImageCached
      .mockResolvedValueOnce(asset.dataUrl)
      .mockResolvedValueOnce(undefined)
    mocks.deleteImageIfUnreferenced.mockResolvedValue(undefined)

    await expect(sub2ImageAssets.resolve('stored-asset')).resolves.toBe(asset.dataUrl)
    await expect(sub2ImageAssets.resolve('missing-asset')).resolves.toBeNull()
    await expect(sub2ImageAssets.deleteIfUnused('stored-asset')).resolves.toBeUndefined()

    expect(mocks.ensureImageCached).toHaveBeenNthCalledWith(1, 'stored-asset')
    expect(mocks.ensureImageCached).toHaveBeenNthCalledWith(2, 'missing-asset')
    expect(mocks.deleteImageIfUnreferenced).toHaveBeenCalledWith('stored-asset')
  })
})
