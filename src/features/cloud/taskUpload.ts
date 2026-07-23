import type { StoredImageThumbnail, TaskRecord } from '../../types'
import { getImage, getImageThumbnail, getVideo } from '../../lib/db'
import {
  completeCloudUpload,
  createCloudUpload,
  saveCloudTask,
  uploadCloudContent,
} from './api'
import type {
  CloudAssetKind,
  CloudAssetMetadata,
  CloudTask,
  CloudTaskAssetRef,
  CloudTaskBatchResult,
  CloudTaskSaveOptions,
} from './types'

export interface CloudTaskResource {
  assetId: string
  kind: CloudAssetKind
  content: Blob
  metadata: CloudAssetMetadata
}

export interface PreparedCloudTask {
  task: TaskRecord
  assets: CloudTaskAssetRef[]
  resources: CloudTaskResource[]
}

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/)
  if (!match) throw new Error('本地图片数据格式无效')
  const mimeType = match[1] || 'application/octet-stream'
  const text = match[2] ? atob(match[3]) : decodeURIComponent(match[3])
  const bytes = match[2]
    ? Uint8Array.from(text, (char) => char.charCodeAt(0))
    : new TextEncoder().encode(text)
  return new Blob([bytes], { type: mimeType })
}

async function sha256(blob: Blob) {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不支持资源校验')
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error('云端保存已取消')
}

function addRef(refs: CloudTaskAssetRef[], assetId: string, role: CloudTaskAssetRef['role'], index: number) {
  if (refs.some((ref) => ref.assetId === assetId && ref.role === role && ref.index === index)) return
  refs.push({ assetId, role, index })
}

async function addImageResource(resources: Map<string, CloudTaskResource>, id: string) {
  if (resources.has(id)) return
  const image = await getImage(id)
  if (!image) throw new Error(`找不到本地图片：${id}`)
  resources.set(id, {
    assetId: id,
    kind: 'image',
    content: dataUrlToBlob(image.dataUrl),
    metadata: {
      width: image.width,
      height: image.height,
    },
  })
}

async function addThumbnailResource(
  resources: Map<string, CloudTaskResource>,
  sourceId: string,
  thumbnail: StoredImageThumbnail,
) {
  const assetId = `${sourceId}:thumbnail`
  if (resources.has(assetId)) return
  resources.set(assetId, {
    assetId,
    kind: 'image',
    content: dataUrlToBlob(thumbnail.thumbnailDataUrl),
    metadata: {
      width: thumbnail.width,
      height: thumbnail.height,
      sourceId,
    },
  })
}

export async function collectCloudTaskResources(task: TaskRecord): Promise<PreparedCloudTask> {
  const resources = new Map<string, CloudTaskResource>()
  const assets: CloudTaskAssetRef[] = []

  for (const [index, id] of task.inputImageIds.entries()) {
    await addImageResource(resources, id)
    addRef(assets, id, 'input', index)
  }

  if (task.maskTargetImageId && !task.inputImageIds.includes(task.maskTargetImageId)) {
    await addImageResource(resources, task.maskTargetImageId)
    addRef(assets, task.maskTargetImageId, 'input', task.inputImageIds.length)
  }

  if (task.maskImageId) {
    await addImageResource(resources, task.maskImageId)
    addRef(assets, task.maskImageId, 'mask', 0)
  }

  for (const [index, id] of task.outputImages.entries()) {
    await addImageResource(resources, id)
    addRef(assets, id, task.kind === 'video' ? 'poster' : 'output', index)
    const thumbnail = await getImageThumbnail(id)
    if (!thumbnail) continue
    await addThumbnailResource(resources, id, thumbnail)
    addRef(assets, `${id}:thumbnail`, 'thumbnail', index)
  }

  for (const [index, id] of (task.transparentOriginalImages || []).entries()) {
    if (!id) continue
    await addImageResource(resources, id)
    addRef(assets, id, 'original', index)
  }

  for (const [index, id] of (task.outputVideoIds || []).entries()) {
    const video = await getVideo(id)
    if (!video) throw new Error(`找不到本地视频：${id}`)
    resources.set(id, {
      assetId: id,
      kind: 'video',
      content: video.blob,
      metadata: {
        width: video.width,
        height: video.height,
        duration: video.duration,
      },
    })
    addRef(assets, id, 'video', index)
  }

  const {
    customRecoverable,
    customTaskId,
    falEndpoint,
    falRecoverable,
    falRequestId,
    rawImageUrls,
    rawResponsePayload,
    streamPartialImageIds,
    videoPollInterval,
    videoRemoteId,
    ...savedTask
  } = task
  return { task: savedTask, assets, resources: [...resources.values()] }
}

async function savePreparedTask(prepared: PreparedCloudTask, options: CloudTaskSaveOptions) {
  const total = prepared.resources.length + 1
  options.onProgress?.({
    taskId: prepared.task.id,
    state: 'uploading',
    completed: 0,
    total,
  })

  for (const [index, resource] of prepared.resources.entries()) {
    throwIfAborted(options.signal)
    const upload = await createCloudUpload({
      assetId: resource.assetId,
      kind: resource.kind,
      mimeType: resource.content.type || 'application/octet-stream',
      size: resource.content.size,
      sha256: await sha256(resource.content),
      metadata: resource.metadata,
    }, options.signal)
    throwIfAborted(options.signal)
    if (upload.uploadRequired) await uploadCloudContent(upload.id, resource.content, options.signal)
    throwIfAborted(options.signal)
    if (!upload.asset) await completeCloudUpload(upload.id, options.signal)
    options.onProgress?.({
      taskId: prepared.task.id,
      state: 'uploading',
      completed: index + 1,
      total,
      assetId: resource.assetId,
    })
  }

  options.onProgress?.({
    taskId: prepared.task.id,
    state: 'saving',
    completed: total - 1,
    total,
  })
  throwIfAborted(options.signal)
  const saved = await saveCloudTask(prepared.task, prepared.assets, options.signal)
  options.onProgress?.({
    taskId: prepared.task.id,
    state: 'done',
    completed: total,
    total,
  })
  return saved
}

export async function saveTaskToCloud(task: TaskRecord, options: CloudTaskSaveOptions = {}) {
  options.onProgress?.({
    taskId: task.id,
    state: 'preparing',
    completed: 0,
    total: 0,
  })
  try {
    const prepared = await collectCloudTaskResources(task)
    throwIfAborted(options.signal)
    return await savePreparedTask(prepared, options)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    options.onProgress?.({
      taskId: task.id,
      state: 'error',
      completed: 0,
      total: 0,
      error: error.message,
    })
    throw error
  }
}

export async function saveTasksToCloud(tasks: readonly TaskRecord[], options: CloudTaskSaveOptions = {}): Promise<CloudTaskBatchResult> {
  const saved: CloudTask[] = []
  const failed: CloudTaskBatchResult['failed'] = []

  for (const task of tasks) {
    try {
      saved.push(await saveTaskToCloud(task, options))
    } catch (err) {
      failed.push({
        taskId: task.id,
        error: err instanceof Error ? err : new Error(String(err)),
      })
    }
  }

  return { saved, failed }
}
