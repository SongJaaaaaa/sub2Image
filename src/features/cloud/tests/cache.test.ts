import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getImage,
  getStoredFreshImageThumbnail,
  getVideo,
  putImage,
  putImageThumbnail,
  putVideo,
} from '../../../lib/db'
import { downloadCloudAsset, getCloudBootstrap } from '../api'
import { subscribeImageThumbnail } from '../../imageLibrary/imageThumbnailEvents'
import {
  clearCloudAssetRegistry,
  ensureCloudAssetCached,
  getRegisteredCloudAsset,
  loadCloudBootstrap,
} from '../cache'
import type { CloudAsset, CloudBootstrap } from '../types'

vi.mock('../../../lib/db', () => ({
  CURRENT_THUMBNAIL_VERSION: 2,
  getImage: vi.fn(),
  getStoredFreshImageThumbnail: vi.fn(),
  getVideo: vi.fn(),
  putImage: vi.fn(),
  putImageThumbnail: vi.fn(),
  putVideo: vi.fn(),
}))

vi.mock('../api', () => ({
  downloadCloudAsset: vi.fn(),
  getCloudBootstrap: vi.fn(),
}))

function asset(value: Partial<CloudAsset> = {}): CloudAsset {
  return {
    id: 'cloud-asset-1',
    assetId: 'image-1',
    kind: 'image',
    mimeType: 'image/png',
    size: 5,
    sha256: 'a'.repeat(64),
    metadata: { width: 100, height: 80 },
    contentUrl: '/api/assets/cloud-asset-1/content',
    createdAt: '2026-07-23T00:00:00.000Z',
    ...value,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearCloudAssetRegistry()
  vi.mocked(getImage).mockResolvedValue(undefined)
  vi.mocked(getStoredFreshImageThumbnail).mockResolvedValue(undefined)
  vi.mocked(getVideo).mockResolvedValue(undefined)
  vi.mocked(downloadCloudAsset).mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
})

describe('云端资源本地缓存', () => {
  it('按本地 assetId 写入原图缓存', async () => {
    await ensureCloudAssetCached(asset())

    expect(downloadCloudAsset).toHaveBeenCalledWith('cloud-asset-1', undefined)
    expect(putImage).toHaveBeenCalledWith(expect.objectContaining({
      id: 'image-1',
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      width: 100,
      height: 80,
    }))
  })

  it('bootstrap 只预取缩略图，不下载原图', async () => {
    const thumbnail = {
      ...asset({
        id: 'thumbnail-cloud-id',
        assetId: 'image-1:thumbnail',
        mimeType: 'image/webp',
        metadata: { width: 100, height: 80, sourceId: 'image-1' },
      }),
      role: 'thumbnail' as const,
      index: 0,
    }
    const original = { ...asset(), role: 'output' as const, index: 0 }
    const data: CloudBootstrap = {
      account: {
        id: 'account-1',
        provider: 'sub2api',
        externalUserId: 'user-1',
        usedBytes: 0,
        quotaBytes: 100,
        createdAt: '2026-07-23T00:00:00.000Z',
        lastSeenAt: '2026-07-23T00:00:00.000Z',
      },
      tasks: [{
        id: 'task-1',
        task: { id: 'task-1' } as CloudBootstrap['tasks'][number]['task'],
        assets: [original, thumbnail],
        createdAt: '2026-07-23T00:00:00.000Z',
        updatedAt: '2026-07-23T00:00:00.000Z',
      }],
      skills: [],
    }
    vi.mocked(getCloudBootstrap).mockResolvedValue(data)

    await expect(loadCloudBootstrap()).resolves.toBe(data)
    expect(getRegisteredCloudAsset('image-1')).toEqual(original)
    expect(getRegisteredCloudAsset('cloud-asset-1')).toEqual(original)
    expect(downloadCloudAsset).toHaveBeenCalledTimes(1)
    expect(downloadCloudAsset).toHaveBeenCalledWith('thumbnail-cloud-id', undefined)
    expect(putImageThumbnail).toHaveBeenCalledWith(expect.objectContaining({
      id: 'image-1',
      thumbnailVersion: 2,
    }))
    expect(putImage).not.toHaveBeenCalled()
    expect(putVideo).not.toHaveBeenCalled()

    await ensureCloudAssetCached('image-1')
    expect(downloadCloudAsset).toHaveBeenLastCalledWith('cloud-asset-1', undefined)
  })

  it('去重缩略图按当前别名写入对应的本地图片 ID', async () => {
    const thumbnail = asset({
      assetId: 'image-2:thumbnail',
      metadata: { width: 100, height: 80, sourceId: 'image-1' },
    })

    const notified = vi.fn()
    const unsubscribe = subscribeImageThumbnail('image-2', notified)
    await ensureCloudAssetCached(thumbnail)
    unsubscribe()

    expect(getStoredFreshImageThumbnail).toHaveBeenCalledWith('image-2')
    expect(putImageThumbnail).toHaveBeenCalledWith(expect.objectContaining({ id: 'image-2' }))
    expect(notified).toHaveBeenCalledWith(expect.objectContaining({
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      thumbnailVersion: 2,
    }))
  })

  it('旧版本缩略图不可复用时重新下载云端缩略图', async () => {
    const thumbnail = asset({
      id: 'thumbnail-cloud-id',
      assetId: 'image-1:thumbnail',
      mimeType: 'image/webp',
      metadata: { width: 100, height: 80, sourceId: 'image-1' },
    })
    vi.mocked(getStoredFreshImageThumbnail).mockResolvedValue(undefined)

    await ensureCloudAssetCached(thumbnail)

    expect(downloadCloudAsset).toHaveBeenCalledWith('thumbnail-cloud-id', undefined)
    expect(putImageThumbnail).toHaveBeenCalledWith(expect.objectContaining({
      id: 'image-1',
      thumbnailVersion: 2,
    }))
  })

  it('单个缩略图下载失败时继续恢复其他云端数据', async () => {
    const thumbnails = ['image-1', 'image-2'].map((id, index) => ({
      ...asset({
        id: `thumbnail-${index}`,
        assetId: `${id}:thumbnail`,
        metadata: { sourceId: id },
      }),
      role: 'thumbnail' as const,
      index,
    }))
    const data: CloudBootstrap = {
      account: {
        id: 'account-1',
        provider: 'sub2api',
        externalUserId: 'user-1',
        usedBytes: 0,
        quotaBytes: 100,
        createdAt: '2026-07-23T00:00:00.000Z',
        lastSeenAt: '2026-07-23T00:00:00.000Z',
      },
      tasks: [{
        id: 'task-1',
        task: { id: 'task-1' } as CloudBootstrap['tasks'][number]['task'],
        assets: thumbnails,
        createdAt: '2026-07-23T00:00:00.000Z',
        updatedAt: '2026-07-23T00:00:00.000Z',
      }],
      skills: [],
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.mocked(getCloudBootstrap).mockResolvedValue(data)
    vi.mocked(downloadCloudAsset)
      .mockRejectedValueOnce(new Error('缩略图下载失败'))
      .mockResolvedValueOnce(new Blob(['image'], { type: 'image/png' }))

    await expect(loadCloudBootstrap()).resolves.toBe(data)
    expect(downloadCloudAsset).toHaveBeenCalledTimes(2)
    expect(putImageThumbnail).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith('预取云端缩略图失败：image-1:thumbnail', expect.any(Error))
    warn.mockRestore()
  })
})
