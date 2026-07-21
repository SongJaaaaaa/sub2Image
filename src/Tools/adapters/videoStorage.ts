import type { TaskRecord } from '../../types'
import { DEFAULT_PARAMS } from '../../types'
import { putTask } from '../../features/tasks/taskPersistence'
import { cacheImage } from '../../features/imageLibrary'
import { deleteVideo, putVideo, storeImageWithSize } from '../../lib/db'
import { genId } from '../../lib/id'
import { useStore } from '../../state/appStore'

type EditedVideoOptions = {
  name: string
  posterDataUrl: string
  duration: number
  width: number
  height: number
}

export async function saveEditedToolVideo(blob: Blob, opts: EditedVideoOptions) {
  const videoId = genId()
  const now = Date.now()
  await putVideo({
    id: videoId,
    blob,
    name: opts.name,
    mimeType: blob.type || 'video/mp4',
    duration: opts.duration,
    width: opts.width,
    height: opts.height,
    createdAt: now,
  })

  try {
    const poster = await storeImageWithSize(opts.posterDataUrl, 'edited')
    const size = `${opts.width}x${opts.height}`
    const task: TaskRecord = {
      id: genId(),
      prompt: `视频剪辑：${opts.name}`,
      params: { ...DEFAULT_PARAMS, size, output_format: 'jpeg' },
      actualParams: { size, output_format: 'jpeg' },
      inputImageIds: [],
      outputImages: [poster.id],
      outputVideoIds: [videoId],
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
    cacheImage(poster.id, opts.posterDataUrl)
    return { id: videoId, taskId: task.id, posterId: poster.id }
  } catch (err) {
    await deleteVideo(videoId)
    throw err
  }
}
