import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaskRecord } from '../../../types'
import { DEFAULT_PARAMS } from '../../../types'
import { getImage, getImageThumbnail, getVideo } from '../../../lib/db'
import {
  completeCloudUpload,
  createCloudUpload,
  saveCloudTask,
  uploadCloudContent,
} from '../api'
import { collectCloudTaskResources, saveTaskToCloud, saveTasksToCloud } from '../taskUpload'

vi.mock('../../../lib/db', () => ({
  getImage: vi.fn(),
  getImageThumbnail: vi.fn(),
  getVideo: vi.fn(),
}))

vi.mock('../api', () => ({
  completeCloudUpload: vi.fn(),
  createCloudUpload: vi.fn(),
  saveCloudTask: vi.fn(),
  uploadCloudContent: vi.fn(),
}))

function task(): TaskRecord {
  return {
    id: 'task-1',
    prompt: '测试图片',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: ['input-1'],
    maskTargetImageId: 'input-1',
    maskImageId: 'mask-1',
    outputImages: ['output-1'],
    transparentOriginalImages: ['original-1'],
    outputVideoIds: ['video-1'],
    videoRemoteId: 'remote-video-1',
    videoPollInterval: 3000,
    falRequestId: 'fal-request-1',
    falEndpoint: 'fal-endpoint',
    falRecoverable: true,
    customTaskId: 'custom-task-1',
    customRecoverable: true,
    streamPartialImageIds: ['partial-1'],
    rawImageUrls: ['https://example.com/signed'],
    rawResponsePayload: '{"debug":true}',
    status: 'done',
    error: null,
    createdAt: 1,
    finishedAt: 2,
    elapsed: 1,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getImage).mockImplementation(async (id) => ({
    id,
    dataUrl: `data:image/png;base64,${btoa(id)}`,
    width: 1024,
    height: 768,
  }))
  vi.mocked(getImageThumbnail).mockResolvedValue({
    id: 'output-1',
    thumbnailDataUrl: `data:image/webp;base64,${btoa('thumbnail')}`,
    width: 1024,
    height: 768,
    thumbnailVersion: 2,
  })
  vi.mocked(getVideo).mockResolvedValue({
    id: 'video-1',
    blob: new Blob(['video'], { type: 'video/mp4' }),
    name: 'video.mp4',
    mimeType: 'video/mp4',
    duration: 6,
    width: 1280,
    height: 720,
    createdAt: 1,
  })
  vi.mocked(createCloudUpload).mockImplementation(async (input) => ({
    id: `upload-${input.assetId}`,
    assetId: input.assetId,
    status: 'pending',
    uploadRequired: true,
  }))
  vi.mocked(uploadCloudContent).mockResolvedValue(undefined)
  vi.mocked(completeCloudUpload).mockImplementation(async (id) => ({
    id: `asset-${id}`,
    assetId: id.replace('upload-', ''),
    kind: 'image',
    mimeType: 'image/png',
    size: 1,
    sha256: 'a'.repeat(64),
    metadata: {},
    contentUrl: '/content',
    createdAt: '2026-07-23T00:00:00.000Z',
  }))
  vi.mocked(saveCloudTask).mockImplementation(async (savedTask, assets) => ({
    id: savedTask.id,
    task: savedTask,
    assets: assets.map((asset) => ({
      ...asset,
      id: asset.assetId,
      kind: asset.role === 'video' ? 'video' : 'image',
      mimeType: asset.role === 'video' ? 'video/mp4' : 'image/png',
      size: 1,
      sha256: 'a'.repeat(64),
      metadata: {},
      contentUrl: '/content',
      createdAt: '2026-07-23T00:00:00.000Z',
    })),
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
  }))
})

describe('云端任务资源', () => {
  it('收集完整任务资源，但排除调试中间图片', async () => {
    const prepared = await collectCloudTaskResources(task())

    expect(prepared.resources.map((resource) => resource.assetId)).toEqual([
      'input-1',
      'mask-1',
      'output-1',
      'output-1:thumbnail',
      'original-1',
      'video-1',
    ])
    expect(prepared.assets).toEqual(expect.arrayContaining([
      { assetId: 'input-1', role: 'input', index: 0 },
      { assetId: 'mask-1', role: 'mask', index: 0 },
      { assetId: 'output-1', role: 'output', index: 0 },
      { assetId: 'output-1:thumbnail', role: 'thumbnail', index: 0 },
      { assetId: 'original-1', role: 'original', index: 0 },
      { assetId: 'video-1', role: 'video', index: 0 },
    ]))
    expect(prepared.task).not.toHaveProperty('streamPartialImageIds')
    expect(prepared.task).not.toHaveProperty('rawResponsePayload')
    expect(prepared.task).not.toHaveProperty('rawImageUrls')
    expect(prepared.task).not.toHaveProperty('videoRemoteId')
    expect(prepared.task).not.toHaveProperty('falRequestId')
    expect(prepared.task).not.toHaveProperty('customTaskId')
    expect(getImage).not.toHaveBeenCalledWith('partial-1')
  })

  it('视频任务把 outputImages 作为 poster 关联', async () => {
    const prepared = await collectCloudTaskResources({ ...task(), kind: 'video' })

    expect(prepared.assets).toContainEqual({ assetId: 'output-1', role: 'poster', index: 0 })
    expect(prepared.assets).not.toContainEqual({ assetId: 'output-1', role: 'output', index: 0 })
  })

  it('先上传资源，再保存任务关联并报告进度', async () => {
    const progress = vi.fn()

    await expect(saveTaskToCloud(task(), { onProgress: progress })).resolves.toMatchObject({ id: 'task-1' })
    expect(uploadCloudContent).toHaveBeenCalledTimes(6)
    expect(completeCloudUpload).toHaveBeenCalledTimes(6)
    expect(saveCloudTask).toHaveBeenCalledOnce()
    expect(vi.mocked(saveCloudTask).mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...vi.mocked(completeCloudUpload).mock.invocationCallOrder),
    )
    expect(progress).toHaveBeenLastCalledWith({
      taskId: 'task-1',
      state: 'done',
      completed: 7,
      total: 7,
    })
    expect(vi.mocked(createCloudUpload).mock.calls[0][0].sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('批量保存保留失败项供 UI 重试', async () => {
    vi.mocked(getImage).mockRejectedValueOnce(new Error('本地图片损坏'))
    const result = await saveTasksToCloud([task(), { ...task(), id: 'task-2' }])

    expect(result.failed).toEqual([{ taskId: 'task-1', error: expect.any(Error) }])
    expect(result.saved).toHaveLength(1)
    expect(result.saved[0].id).toBe('task-2')
  })
})
