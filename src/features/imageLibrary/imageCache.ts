import {
  CURRENT_THUMBNAIL_VERSION,
  getImage,
  getImageThumbnail,
  getStoredFreshImageThumbnail,
} from '../../lib/db'
import { ensureCloudAssetCached, getRegisteredCloudAsset } from '../cloud/cache'
import {
  clearImageThumbnailSubscribers,
  notifyImageThumbnail,
  subscribeImageThumbnail,
  type ImageThumbnail,
} from './imageThumbnailEvents'

export { subscribeImageThumbnail } from './imageThumbnailEvents'

type ThumbnailPriority = 'visible' | 'background'

const MAX_IMAGE_CACHE_ENTRIES = 8
const MAX_THUMBNAIL_CACHE_ENTRIES = 80
const MAX_THUMBNAIL_BACKFILL_CONCURRENT = 4

const imageCache = new Map<string, string>()
const thumbnailCache = new Map<string, ImageThumbnail>()
const thumbnailBackfillIds = new Map<string, ThumbnailPriority>()
const thumbnailBackfillRunningIds = new Set<string>()
let thumbnailBackfillScheduled = false

export function getCachedImage(id: string): string | undefined {
  const dataUrl = imageCache.get(id)
  if (dataUrl) {
    imageCache.delete(id)
    imageCache.set(id, dataUrl)
  }
  return dataUrl
}

export function cacheImage(id: string, dataUrl: string) {
  imageCache.delete(id)
  imageCache.set(id, dataUrl)
  while (imageCache.size > MAX_IMAGE_CACHE_ENTRIES) {
    const oldestKey = imageCache.keys().next().value
    if (oldestKey == null) break
    imageCache.delete(oldestKey)
  }
}

export function removeCachedImage(id: string) {
  imageCache.delete(id)
}

export function clearImageRuntimeCache(id: string) {
  imageCache.delete(id)
  thumbnailCache.delete(id)
  thumbnailBackfillIds.delete(id)
  thumbnailBackfillRunningIds.delete(id)
  clearImageThumbnailSubscribers(id)
}

export async function ensureImageCached(id: string): Promise<string | undefined> {
  const cached = getCachedImage(id)
  if (cached) return cached
  const local = await getImage(id)
  if (local) {
    cacheImage(id, local.dataUrl)
    return local.dataUrl
  }

  const asset = getRegisteredCloudAsset(id)
  if (!asset || asset.kind !== 'image' || asset.metadata.sourceId) return undefined
  const rec = await ensureCloudAssetCached(asset)
  if (!('dataUrl' in rec)) return undefined
  cacheImage(id, rec.dataUrl)
  return rec.dataUrl
}

export async function ensureImageThumbnailCached(id: string): Promise<ImageThumbnail | undefined> {
  const cached = getCachedThumbnail(id)
  if (cached) return cached

  const rec = await getStoredFreshImageThumbnail(id)
  if (!rec?.thumbnailDataUrl) {
    scheduleThumbnailBackfill([id], 'visible')
    return undefined
  }

  const thumbnail = {
    dataUrl: rec.thumbnailDataUrl,
    width: rec.width,
    height: rec.height,
    thumbnailVersion: rec.thumbnailVersion,
  }
  cacheThumbnail(id, thumbnail)
  return thumbnail
}

export function scheduleThumbnailBackfill(ids: Iterable<string>, priority: ThumbnailPriority = 'background') {
  for (const id of ids) {
    if (getCachedThumbnail(id) || thumbnailBackfillRunningIds.has(id)) continue
    const currentPriority = thumbnailBackfillIds.get(id)
    if (!currentPriority || priority === 'visible') thumbnailBackfillIds.set(id, priority)
  }
  scheduleThumbnailBackfillTick()
}

function getCachedThumbnail(id: string) {
  const thumbnail = thumbnailCache.get(id)
  if (thumbnail?.thumbnailVersion === CURRENT_THUMBNAIL_VERSION) {
    thumbnailCache.delete(id)
    thumbnailCache.set(id, thumbnail)
    return thumbnail
  }
  if (thumbnail) thumbnailCache.delete(id)
  return undefined
}

export function cacheThumbnail(id: string, thumbnail: ImageThumbnail) {
  if (thumbnail.thumbnailVersion !== CURRENT_THUMBNAIL_VERSION) return
  thumbnailCache.delete(id)
  thumbnailCache.set(id, thumbnail)
  while (thumbnailCache.size > MAX_THUMBNAIL_CACHE_ENTRIES) {
    const oldestKey = thumbnailCache.keys().next().value
    if (oldestKey == null) break
    thumbnailCache.delete(oldestKey)
  }
}

function scheduleThumbnailBackfillTick() {
  if (thumbnailBackfillScheduled || thumbnailBackfillIds.size === 0) return
  thumbnailBackfillScheduled = true

  const run = () => {
    thumbnailBackfillScheduled = false
    void processNextThumbnailBackfill()
  }

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2_000 })
  } else {
    globalThis.setTimeout(run, 250)
  }
}

async function processNextThumbnailBackfill() {
  if (thumbnailBackfillRunningIds.size > 0) return

  const ids = await getNextThumbnailBackfillBatch()
  for (const id of ids) startThumbnailBackfill(id)

  if (thumbnailBackfillIds.size > 0) scheduleThumbnailBackfillTick()
}

async function getNextThumbnailBackfillBatch() {
  const candidates = getOrderedThumbnailBackfillIds().slice(0, MAX_THUMBNAIL_BACKFILL_CONCURRENT)
  if (candidates.length === 0) return []

  const sizes = await Promise.all(candidates.map(async (id) => {
    const image = await getImage(id)
    return { width: image?.width, height: image?.height }
  }))
  const concurrency = getThumbnailConcurrencyForBatch(sizes)
  const selected = candidates.slice(0, concurrency)
  for (const id of selected) thumbnailBackfillIds.delete(id)
  return selected
}

function getOrderedThumbnailBackfillIds() {
  const visible: string[] = []
  const background: string[] = []
  for (const [id, priority] of thumbnailBackfillIds) {
    if (priority === 'visible') visible.push(id)
    else background.push(id)
  }
  return [...visible, ...background]
}

function getThumbnailConcurrencyForBatch(sizes: Array<{ width?: number; height?: number }>) {
  let maxMegapixels = 0
  for (const { width, height } of sizes) {
    if (!width || !height) return 1
    maxMegapixels = Math.max(maxMegapixels, (width * height) / 1_000_000)
  }
  if (maxMegapixels >= 8) return 1
  if (maxMegapixels >= 4) return 2
  if (maxMegapixels >= 2) return 3
  return 4
}

function startThumbnailBackfill(id: string) {
  thumbnailBackfillRunningIds.add(id)

  void (async () => {
    if (getCachedThumbnail(id)) return

    const thumbnail = await getImageThumbnail(id)
    if (!thumbnail?.thumbnailDataUrl) return
    const cached = {
      dataUrl: thumbnail.thumbnailDataUrl,
      width: thumbnail.width,
      height: thumbnail.height,
      thumbnailVersion: thumbnail.thumbnailVersion,
    }
    cacheThumbnail(id, cached)
    notifyImageThumbnail(id, cached)
  })().catch(() => {
    // 缩略图回填失败时保留占位图，后续可再次调度。
  }).finally(() => {
    thumbnailBackfillRunningIds.delete(id)
    scheduleThumbnailBackfillTick()
  })
}
