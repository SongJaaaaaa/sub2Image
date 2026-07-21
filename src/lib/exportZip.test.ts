import { describe, expect, it } from 'vitest'

import { createPromptProject, imageDomain } from '../features/promptStudio'
import type { AppSettings, StoredImage, StoredImageThumbnail, StoredVideo, TaskParams, TaskRecord } from '../types'
import { buildExportZip, readExportZip, readExportZipFileAsDataUrl } from './exportZip'

describe('exportZip', () => {
  it('builds and reads backup zip entries without changing manifest shape', () => {
    const task: TaskRecord = {
      id: 'task-1',
      prompt: '提示词',
      params: {} as TaskParams,
      inputImageIds: ['img-1'],
      outputImages: ['img-2'],
      outputVideoIds: ['video-1'],
      streamPartialImageIds: ['img-3'],
      status: 'done',
      error: null,
      createdAt: 1700000000000,
      finishedAt: 1700000000200,
      elapsed: 200,
    }
    const images: StoredImage[] = [{
      id: 'img-1',
      dataUrl: 'data:image/png;base64,AAECAw==',
      source: 'generated',
    }, {
      id: 'img-2',
      dataUrl: 'data:image/png;base64,BAUGBw==',
      source: 'generated',
    }, {
      id: 'img-3',
      dataUrl: 'data:image/png;base64,CAkKCw==',
      source: 'generated',
    }]
    const thumbnail: StoredImageThumbnail = {
      id: 'img-1',
      thumbnailDataUrl: 'data:image/jpeg;base64,BAUG',
      width: 32,
      height: 24,
      thumbnailVersion: 2,
    }
    const video: StoredVideo = {
      id: 'video-1',
      blob: new Blob(['video']),
      name: 'result.mp4',
      mimeType: 'video/mp4',
      duration: 8,
      width: 1280,
      height: 720,
      createdAt: 1700000000000,
    }

    const { manifest, bytes } = buildExportZip({
      options: { exportConfig: true, exportTasks: true },
      exportedAt: 1700000001000,
      settings: {} as AppSettings,
      tasks: [task],
      images,
      videos: [{ record: video, bytes: new Uint8Array([1, 2, 3]) }],
      thumbnailsByImageId: new Map([[thumbnail.id, thumbnail]]),
      favoriteCollections: [],
      defaultFavoriteCollectionId: null,
      agentConversations: [],
      promptProjects: [],
    })
    const parsed = readExportZip(bytes)

    expect(parsed.manifest).toEqual(manifest)
    expect(parsed.manifest.version).toBe(4)
    expect(parsed.manifest.exportedAt).toBe(new Date(1700000001000).toISOString())
    expect(parsed.manifest.imageFiles?.['img-1']).toEqual({
      path: 'images/task-task-1-input.png',
      createdAt: 1700000000000,
      source: 'generated',
      width: 32,
      height: 24,
    })
    expect(parsed.manifest.imageFiles?.['img-2']?.path).toBe('images/task-task-1.png')
    expect(parsed.manifest.imageFiles?.['img-3']?.path).toBe('images/task-task-1-partial.png')
    expect(parsed.manifest.thumbnailFiles?.['img-1']).toEqual({
      path: 'thumbnails/task-task-1-input.jpeg',
      width: 32,
      height: 24,
      thumbnailVersion: 2,
    })
    expect(readExportZipFileAsDataUrl(parsed.files, 'images/task-task-1-input.png')).toBe(images[0].dataUrl)
    expect(readExportZipFileAsDataUrl(parsed.files, 'images/task-task-1.png')).toBe(images[1].dataUrl)
    expect(readExportZipFileAsDataUrl(parsed.files, 'images/task-task-1-partial.png')).toBe(images[2].dataUrl)
    expect(readExportZipFileAsDataUrl(parsed.files, 'thumbnails/task-task-1-input.jpeg')).toBe(thumbnail.thumbnailDataUrl)
    expect(parsed.manifest.videoFiles?.['video-1']).toMatchObject({
      path: 'videos/result-video-1.mp4',
      name: 'result.mp4',
      duration: 8,
      width: 1280,
      height: 720,
    })
    expect(Array.from(parsed.files['videos/result-video-1.mp4'])).toEqual([1, 2, 3])
  })

  it('exports prompt projects and images referenced only by a project', () => {
    const project = createPromptProject({
      id: 'project-1',
      conversationId: 'conversation-1',
      title: '项目',
      domain: imageDomain,
      source: {
        type: 'conversation',
        assets: [{ id: 'project-image', type: 'image', label: '主体参考' }],
      },
      now: 1700000000000,
    })
    const image: StoredImage = {
      id: 'project-image',
      dataUrl: 'data:image/png;base64,AAECAw==',
      source: 'upload',
    }

    const { manifest, bytes } = buildExportZip({
      options: { exportPromptProjects: true },
      exportedAt: 1700000001000,
      settings: {} as AppSettings,
      tasks: [],
      images: [image],
      thumbnailsByImageId: new Map(),
      favoriteCollections: [],
      defaultFavoriteCollectionId: null,
      agentConversations: [],
      promptProjects: [project],
    })
    const parsed = readExportZip(bytes)
    const path = manifest.imageFiles?.[image.id]?.path

    expect(parsed.manifest.promptProjects).toEqual([project])
    expect(path).toBe('images/prompt-project-1-主体参考.png')
    expect(readExportZipFileAsDataUrl(parsed.files, path || '')).toBe(image.dataUrl)
  })
})
