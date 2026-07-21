import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRecord } from '../../types'
import { saveEditedToolVideo } from './videoStorage'

const mocks = vi.hoisted(() => ({
  cacheImage: vi.fn(),
  deleteVideo: vi.fn(),
  genId: vi.fn(),
  putTask: vi.fn(),
  putVideo: vi.fn(),
  setTasks: vi.fn(),
  storeImageWithSize: vi.fn(),
  tasks: [] as TaskRecord[],
}))

vi.mock('../../features/imageLibrary', () => ({ cacheImage: mocks.cacheImage }))
vi.mock('../../features/tasks/taskPersistence', () => ({ putTask: mocks.putTask }))
vi.mock('../../lib/db', () => ({
  deleteVideo: mocks.deleteVideo,
  putVideo: mocks.putVideo,
  storeImageWithSize: mocks.storeImageWithSize,
}))
vi.mock('../../lib/id', () => ({ genId: mocks.genId }))
vi.mock('../../state/appStore', () => ({
  useStore: { getState: () => ({ tasks: mocks.tasks, setTasks: mocks.setTasks }) },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tasks = []
  mocks.genId.mockReturnValueOnce('video-id').mockReturnValueOnce('task-id')
  mocks.storeImageWithSize.mockResolvedValue({ id: 'poster-id', width: 640, height: 360 })
})

describe('video storage adapter', () => {
  it('persists the video blob, poster and gallery task', async () => {
    const blob = new Blob(['video'], { type: 'video/mp4' })
    const result = await saveEditedToolVideo(blob, {
      name: 'result.mp4',
      posterDataUrl: 'data:image/jpeg;base64,poster',
      duration: 4,
      width: 1280,
      height: 720,
    })

    expect(mocks.putVideo).toHaveBeenCalledWith(expect.objectContaining({
      id: 'video-id',
      blob,
      name: 'result.mp4',
      duration: 4,
      width: 1280,
      height: 720,
    }))
    expect(mocks.putTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-id',
      outputImages: ['poster-id'],
      outputVideoIds: ['video-id'],
      status: 'done',
    }))
    expect(mocks.setTasks).toHaveBeenCalledWith([expect.objectContaining({ id: 'task-id' })])
    expect(mocks.cacheImage).toHaveBeenCalledWith('poster-id', 'data:image/jpeg;base64,poster')
    expect(result).toEqual({ id: 'video-id', taskId: 'task-id', posterId: 'poster-id' })
  })

  it('removes the video when creating the gallery task fails', async () => {
    mocks.putTask.mockRejectedValueOnce(new Error('failed'))
    await expect(saveEditedToolVideo(new Blob(['video']), {
      name: 'result.mp4',
      posterDataUrl: 'data:image/jpeg;base64,poster',
      duration: 4,
      width: 1280,
      height: 720,
    })).rejects.toThrow('failed')
    expect(mocks.deleteVideo).toHaveBeenCalledWith('video-id')
  })
})
