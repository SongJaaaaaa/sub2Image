import type { StoredImage } from '../../types'
import { fileToDataUrl } from '../../lib/dataUrl'
import { getAllImages, getImage, getStoredFreshImageThumbnail, storeImageWithSize } from '../../lib/db'
import { cacheImage, ensureImageCached } from '../../features/imageLibrary'

export type ToolImage = Pick<StoredImage, 'id' | 'createdAt' | 'width' | 'height' | 'source'> & {
  thumbnailDataUrl: string
}

export async function listToolImages(): Promise<ToolImage[]> {
  const images = await getAllImages()
  const items = await Promise.all(images.map(async (image) => {
    const thumbnail = await getStoredFreshImageThumbnail(image.id)
    return {
      id: image.id,
      createdAt: image.createdAt,
      width: image.width,
      height: image.height,
      source: image.source,
      thumbnailDataUrl: thumbnail?.thumbnailDataUrl ?? image.dataUrl,
    }
  }))
  return items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

export async function getToolImage(id: string) {
  const dataUrl = await ensureImageCached(id)
  if (!dataUrl) return null
  const image = await getImage(id)
  return image ? { ...image, dataUrl } : null
}

export async function importToolImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  const dataUrl = await fileToDataUrl(file)
  const stored = await storeImageWithSize(dataUrl, 'upload')
  cacheImage(stored.id, dataUrl)
  return getToolImage(stored.id)
}
