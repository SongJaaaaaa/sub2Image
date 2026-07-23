import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getToolVideo, listToolVideos } from './videoLibrary'

const mocks = vi.hoisted(() => ({
  getAllVideos: vi.fn(),
  getVideo: vi.fn(),
}))

vi.mock('../../lib/db', () => ({
  getAllVideos: mocks.getAllVideos,
  getVideo: mocks.getVideo,
}))

const newer = {
  id: 'new',
  blob: new Blob(['new-video']),
  name: 'new.mp4',
  mimeType: 'video/mp4',
  duration: 8,
  width: 1280,
  height: 720,
  createdAt: 20,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAllVideos.mockResolvedValue([{ ...newer, id: 'old', createdAt: 10 }, newer])
  mocks.getVideo.mockResolvedValue(newer)
})

describe('video library adapter', () => {
  it('只向工具列表暴露元数据并按时间倒序排列', async () => {
    const items = await listToolVideos()
    expect(items.map((item) => item.id)).toEqual(['new', 'old'])
    expect(items[0]).not.toHaveProperty('blob')
    expect(items[0].size).toBe(newer.blob.size)
  })

  it('按需读取识别所需的视频 Blob', async () => {
    await expect(getToolVideo('new')).resolves.toEqual({ ...newer, size: newer.blob.size })
    mocks.getVideo.mockResolvedValueOnce(undefined)
    await expect(getToolVideo('missing')).resolves.toBeNull()
  })
})
