import type { TaskRecord } from '../../types'
import { DEFAULT_PARAMS } from '../../types'
import { putTask } from '../../features/tasks/taskPersistence'
import { cacheImage } from '../../features/imageLibrary'
import { getImage, putImage, storeImageWithSize } from '../../lib/db'
import { genId } from '../../lib/id'
import { useStore } from '../../state/appStore'

type EditedImageOptions = {
  name?: string
  extension?: string
  taskPrompt?: string
}

export async function saveEditedToolImage(dataUrl: string, sourceImageId: string, opts: EditedImageOptions = {}) {
  const stored = await storeImageWithSize(dataUrl, 'edited')
  const image = await getImage(stored.id)
  if (!image) throw new Error('编辑结果保存失败')

  if (stored.id !== sourceImageId && (image.source !== 'edited' || image.sourceImageId !== sourceImageId)) {
    await putImage({ ...image, source: 'edited', sourceImageId })
  }

  const now = Date.now()
  const format = opts.extension === 'jpg' ? 'jpeg' : opts.extension
  const outputFormat = format === 'jpeg' || format === 'webp' ? format : 'png'
  const size = stored.width && stored.height ? `${stored.width}x${stored.height}` : 'auto'
  const task: TaskRecord = {
    id: genId(),
    prompt: opts.taskPrompt ?? (opts.name ? `图片编辑器：${opts.name}` : '图片编辑器编辑结果'),
    params: { ...DEFAULT_PARAMS, size, output_format: outputFormat },
    actualParams: { size, output_format: outputFormat },
    inputImageIds: [sourceImageId],
    outputImages: [stored.id],
    status: 'done',
    error: null,
    createdAt: now,
    finishedAt: now,
    elapsed: 0,
    sourceMode: 'gallery',
  }

  await putTask(task)
  const state = useStore.getState()
  state.setTasks([task, ...state.tasks])
  cacheImage(stored.id, dataUrl)
  return { id: stored.id, taskId: task.id, width: stored.width, height: stored.height }
}
