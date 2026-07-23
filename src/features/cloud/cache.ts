import {
  CURRENT_THUMBNAIL_VERSION,
  getImage,
  getStoredFreshImageThumbnail,
  getVideo,
  putImage,
  putImageThumbnail,
  putVideo,
} from '../../lib/db'
import { notifyImageThumbnail } from '../imageLibrary/imageThumbnailEvents'
import { downloadCloudAsset, getCloudBootstrap } from './api'
import type {
  CachedCloudAsset,
  CloudAsset,
  CloudBootstrapOptions,
  CloudTaskAsset,
} from './types'

const assetsById = new Map<string, CloudAsset>()

export function registerCloudAssets(assets: readonly CloudAsset[]) {
  for (const asset of assets) {
    assetsById.set(asset.id, asset)
    assetsById.set(asset.assetId, asset)
  }
}

export function getRegisteredCloudAsset(id: string) {
  return assetsById.get(id)
}

export function clearCloudAssetRegistry() {
  assetsById.clear()
}

async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let text = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(text)}`
}

function createdAt(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : Date.now()
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error('云端同步已取消')
}

async function downloadAssetBlob(asset: CloudAsset, signal?: AbortSignal) {
  const blob = await downloadCloudAsset(asset.id, signal)
  return blob.type ? blob : new Blob([blob], { type: asset.mimeType })
}

export async function ensureCloudAssetCached(value: CloudAsset | string, signal?: AbortSignal): Promise<CachedCloudAsset> {
  throwIfAborted(signal)
  const asset = typeof value === 'string' ? assetsById.get(value) : value
  if (!asset) throw new Error(`找不到云端资源：${value}`)
  const sourceId = asset.assetId.endsWith(':thumbnail')
    ? asset.assetId.slice(0, -':thumbnail'.length)
    : asset.metadata.sourceId
  if (sourceId) {
    const cached = await getStoredFreshImageThumbnail(sourceId)
    if (cached) return cached
    const thumbnailDataUrl = await blobToDataUrl(await downloadAssetBlob(asset, signal))
    throwIfAborted(signal)
    const thumbnail = {
      id: sourceId,
      thumbnailDataUrl,
      width: asset.metadata.width,
      height: asset.metadata.height,
      thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    }
    await putImageThumbnail(thumbnail)
    notifyImageThumbnail(sourceId, {
      dataUrl: thumbnail.thumbnailDataUrl,
      width: thumbnail.width,
      height: thumbnail.height,
      thumbnailVersion: thumbnail.thumbnailVersion,
    })
    return thumbnail
  }

  if (asset.kind === 'image') {
    const cached = await getImage(asset.assetId)
    if (cached) return cached
    const dataUrl = await blobToDataUrl(await downloadAssetBlob(asset, signal))
    throwIfAborted(signal)
    const image = {
      id: asset.assetId,
      dataUrl,
      createdAt: createdAt(asset.createdAt),
      width: asset.metadata.width,
      height: asset.metadata.height,
    }
    await putImage(image)
    return image
  }

  const cached = await getVideo(asset.assetId)
  if (cached) return cached
  if (typeof asset.metadata.width !== 'number'
    || typeof asset.metadata.height !== 'number'
    || typeof asset.metadata.duration !== 'number') {
    throw new Error(`云端视频元数据不完整：${asset.assetId}`)
  }
  const blob = await downloadAssetBlob(asset, signal)
  throwIfAborted(signal)
  const video = {
    id: asset.assetId,
    blob,
    name: asset.assetId,
    mimeType: asset.mimeType,
    duration: asset.metadata.duration,
    width: asset.metadata.width,
    height: asset.metadata.height,
    createdAt: createdAt(asset.createdAt),
  }
  await putVideo(video)
  return video
}

export async function cacheCloudThumbnails(assets: readonly CloudTaskAsset[], options: CloudBootstrapOptions = {}) {
  const thumbnails = assets.filter((asset) => asset.role === 'thumbnail')
  for (const [index, asset] of thumbnails.entries()) {
    throwIfAborted(options.signal)
    try {
      await ensureCloudAssetCached(asset, options.signal)
    } catch (err) {
      if (options.signal?.aborted) throw err
      console.warn(`预取云端缩略图失败：${asset.assetId}`, err)
    }
    options.onProgress?.({
      completed: index + 1,
      total: thumbnails.length,
      assetId: asset.assetId,
    })
  }
}

export async function loadCloudBootstrap(options: CloudBootstrapOptions = {}) {
  clearCloudAssetRegistry()
  const data = await getCloudBootstrap(options.signal)
  throwIfAborted(options.signal)
  registerCloudAssets(data.tasks.flatMap((task) => task.assets))
  if (options.cacheThumbnails === false) return data
  await cacheCloudThumbnails(data.tasks.flatMap((task) => task.assets), options)
  return data
}
