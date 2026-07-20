import type { ImageReferenceState } from '../../lib/imageReferences'
import { deleteImage } from '../../lib/db'
import { collectReferencedImageIds } from '../../lib/imageReferences'
import { clearImageRuntimeCache } from './imageCache'

export async function deleteImageIfUnreferenced(imageId: string, state: ImageReferenceState) {
  try {
    const ids = await collectReferencedImageIds(state)
    if (ids.has(imageId)) return
    await deleteImage(imageId)
    clearImageRuntimeCache(imageId)
  } catch {
    // 清理仅用于节省存储空间，失败不影响图片替换结果。
  }
}
