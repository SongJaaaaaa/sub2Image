import type { TaskRecord } from '../../types'
import { deleteImage, storeImage, storeImageWithSize } from '../../lib/db'
import { collectReferencedImageIds } from '../../lib/imageReferences'
import { removeKeyedBackgroundFromDataUrl } from '../../lib/transparentImage'
import { cacheImage, clearImageRuntimeCache } from '../imageLibrary'
import { useStore } from '../../state/appStore'
import { updateTaskInStore } from './taskActions'

export async function storeTaskOutputImages(task: TaskRecord, images: string[]) {
  const outputIds: string[] = []
  const outputDataUrls: string[] = []
  const outputImageSizes: Array<{ width?: number; height?: number }> = []
  const transparentOriginalImageIds: string[] = []
  const storedImageIds: string[] = []

  try {
    for (const dataUrl of images) {
      let outputDataUrl = dataUrl
      if (task.transparentOutput) {
        const original = await storeImageWithSize(dataUrl, 'generated')
        storedImageIds.push(original.id)
        cacheImage(original.id, dataUrl)

        try {
          outputDataUrl = await removeKeyedBackgroundFromDataUrl(dataUrl)
          transparentOriginalImageIds.push(original.id)
        } catch (err) {
          console.warn('透明背景后处理失败，已回退为原始输出', err)
          outputIds.push(original.id)
          outputDataUrls.push(dataUrl)
          outputImageSizes.push(original)
          transparentOriginalImageIds.push('')
          continue
        }
      }

      const stored = await storeImageWithSize(outputDataUrl, 'generated')
      storedImageIds.push(stored.id)
      cacheImage(stored.id, outputDataUrl)
      outputIds.push(stored.id)
      outputDataUrls.push(outputDataUrl)
      outputImageSizes.push(stored)
    }

    return {
      outputIds,
      outputDataUrls,
      outputImageSizes,
      transparentOriginalImageIds: transparentOriginalImageIds.length ? transparentOriginalImageIds : undefined,
    }
  } catch (err) {
    await deleteUnreferencedImageIds(storedImageIds)
    throw err
  }
}

export async function deleteUnreferencedImageIds(imageIds: Iterable<string>) {
  const ids = Array.from(new Set(Array.from(imageIds).filter(Boolean)))
  if (ids.length === 0) return
  const stillUsed = await collectReferencedImageIds(useStore.getState())
  for (const id of ids) {
    if (stillUsed.has(id)) continue
    await deleteImage(id)
    clearImageRuntimeCache(id)
  }
}

export async function persistTaskStreamPartialImage(taskId: string, dataUrl: string) {
  try {
    const id = await storeImage(dataUrl, 'generated')
    cacheImage(id, dataUrl)
    const task = useStore.getState().tasks.find((item) => item.id === taskId)
    if (!task || task.status !== 'running') {
      await deleteUnreferencedImageIds([id])
      return
    }
    const currentIds = task.streamPartialImageIds || []
    if (currentIds.includes(id)) return
    updateTaskInStore(taskId, { streamPartialImageIds: [...currentIds, id] })
  } catch (err) {
    console.error(err)
  }
}
