import { addImageFromFile, createInputImageFromFile, deleteImageIfUnreferenced, ensureImageCached, useStore } from '../../store'

export const MAX_INPUT_IMAGES = 16

export async function addInputImageFiles(files: FileList | File[]) {
  try {
    const currentCount = useStore.getState().inputImages.length
    if (currentCount >= MAX_INPUT_IMAGES) {
      useStore.getState().showToast(
        `参考图数量已达上限（${MAX_INPUT_IMAGES} 张），无法继续添加`,
        'error',
      )
      return
    }

    const remaining = MAX_INPUT_IMAGES - currentCount
    const accepted = Array.from(files).filter((file) => file.type.startsWith('image/'))
    const nextFiles = accepted.slice(0, remaining)
    const discarded = accepted.length - nextFiles.length

    for (const file of nextFiles) await addImageFromFile(file)

    if (discarded > 0) {
      useStore.getState().showToast(
        `已达上限 ${MAX_INPUT_IMAGES} 张，${discarded} 张图片被丢弃`,
        'error',
      )
    }
  } catch (err) {
    useStore.getState().showToast(
      `图片添加失败：${err instanceof Error ? err.message : String(err)}`,
      'error',
    )
  }
}

export async function addInputDropData(data: DataTransfer) {
  if (data.files.length) {
    await addInputImageFiles(data.files)
    return
  }

  const text = data.getData('text/plain')
  const imageIds = text.startsWith('agent-images:')
    ? text.slice('agent-images:'.length).split(',')
    : text.startsWith('agent-image:')
    ? [text.slice('agent-image:'.length)]
    : []
  if (!imageIds.length) return

  try {
    for (const imageId of imageIds) {
      const dataUrl = await ensureImageCached(imageId)
      if (!dataUrl) {
        useStore.getState().showToast('部分图片已不存在', 'error')
        continue
      }
      useStore.getState().addInputImage({ id: imageId, dataUrl })
    }
    useStore.getState().showToast('已上传图片', 'success')
  } catch (err) {
    useStore.getState().showToast(`上传图片失败：${err instanceof Error ? err.message : String(err)}`, 'error')
  }
}

export async function replaceInputImageFile(target: { index: number; id: string }, file: File) {
  try {
    const image = await createInputImageFromFile(file)
    if (!image) {
      useStore.getState().showToast('请选择有效图片', 'error')
      return
    }

    const state = useStore.getState()
    const currentIdx = state.inputImages.findIndex((item) => item.id === target.id)
    const targetIdx = currentIdx >= 0 ? currentIdx : target.index
    const previous = state.inputImages[targetIdx]
    if (!previous) {
      void deleteImageIfUnreferenced(image.id)
      state.showToast('原参考图已不存在', 'error')
      return
    }
    if (previous.id === image.id) {
      state.showToast('参考图未变化', 'info')
      return
    }
    if (state.inputImages.some((item, index) => index !== targetIdx && item.id === image.id)) {
      state.showToast('这张图片已在参考图中', 'info')
      return
    }

    state.replaceInputImage(targetIdx, image)
    state.showToast('参考图已替换', 'success')
  } catch (err) {
    useStore.getState().showToast(`参考图替换失败：${err instanceof Error ? err.message : String(err)}`, 'error')
  }
}
