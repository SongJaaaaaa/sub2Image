import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRecord } from '../../types'
import { saveEditedToolImage } from './imageStorage'

const mocks = vi.hoisted(() => ({
  cacheImage: vi.fn(),
  getImage: vi.fn(),
  putImage: vi.fn(),
  putTask: vi.fn(),
  setTasks: vi.fn(),
  storeImageWithSize: vi.fn(),
  tasks: [] as TaskRecord[],
}))

vi.mock('../../features/imageLibrary', () => ({
  cacheImage: mocks.cacheImage,
}))

vi.mock('../../features/tasks/taskPersistence', () => ({
  putTask: mocks.putTask,
}))

vi.mock('../../lib/db', () => ({
  getImage: mocks.getImage,
  putImage: mocks.putImage,
  storeImageWithSize: mocks.storeImageWithSize,
}))

vi.mock('../../lib/id', () => ({
  genId: () => 'edited-task',
}))

vi.mock('../../state/appStore', () => ({
  useStore: {
    getState: () => ({ tasks: mocks.tasks, setTasks: mocks.setTasks }),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tasks = []
  mocks.storeImageWithSize.mockResolvedValue({ id: 'edited-image', width: 1200, height: 800 })
  mocks.getImage.mockResolvedValue({
    id: 'edited-image',
    dataUrl: 'data:image/jpeg;base64,edited',
    source: 'edited',
    width: 1200,
    height: 800,
  })
})

describe('image editor storage adapter', () => {
  it('持久化编辑图片和画廊任务', async () => {
    const result = await saveEditedToolImage(
      'data:image/jpeg;base64,edited',
      'source-image',
      { name: '商品主图', extension: 'jpg' },
    )

    expect(mocks.storeImageWithSize).toHaveBeenCalledWith('data:image/jpeg;base64,edited', 'edited')
    expect(mocks.putImage).toHaveBeenCalledWith(expect.objectContaining({
      id: 'edited-image',
      source: 'edited',
      sourceImageId: 'source-image',
    }))
    expect(mocks.putTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'edited-task',
      prompt: '图片编辑器：商品主图',
      params: expect.objectContaining({ size: '1200x800', output_format: 'jpeg' }),
      inputImageIds: ['source-image'],
      outputImages: ['edited-image'],
      status: 'done',
      sourceMode: 'gallery',
    }))
    expect(mocks.setTasks).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'edited-task', outputImages: ['edited-image'] }),
    ])
    expect(mocks.cacheImage).toHaveBeenCalledWith('edited-image', 'data:image/jpeg;base64,edited')
    expect(result).toEqual({ id: 'edited-image', taskId: 'edited-task', width: 1200, height: 800 })
  })

  it('未修改像素时不覆盖来源图片元数据', async () => {
    mocks.storeImageWithSize.mockResolvedValue({ id: 'source-image', width: 1, height: 1 })
    mocks.getImage.mockResolvedValue({
      id: 'source-image',
      dataUrl: 'data:image/png;base64,source',
      source: 'upload',
      width: 1,
      height: 1,
    })

    await saveEditedToolImage('data:image/png;base64,source', 'source-image')

    expect(mocks.putImage).not.toHaveBeenCalled()
    expect(mocks.putTask).toHaveBeenCalledWith(expect.objectContaining({
      inputImageIds: ['source-image'],
      outputImages: ['source-image'],
    }))
  })
})
