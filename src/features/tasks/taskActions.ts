import type { TaskRecord } from '../../types'
import { normalizeFavoritePatch } from '../favorites/favoriteTaskState'
import { autoSaveTaskToCloud } from '../cloud'
import { useStore } from '../../state/appStore'
import { putTask } from './taskPersistence'
import { maybeOpenSupportPrompt } from './taskSupportPrompt'

type UpdateTaskOptions = {
  autoSave?: boolean
}

export function updateTaskInStore(taskId: string, patch: Partial<TaskRecord>, options: UpdateTaskOptions = {}) {
  const { tasks, setTasks, defaultFavoriteCollectionId } = useStore.getState()
  const previous = tasks.find((task) => task.id === taskId)
  const updated = tasks.map((task) =>
    task.id === taskId ? { ...task, ...normalizeFavoritePatch(task, patch, defaultFavoriteCollectionId) } : task,
  )
  const task = updated.find((item) => item.id === taskId)
  setTasks(updated)
  maybeOpenSupportPrompt(tasks, updated, taskId)
  if (!task) return
  return putTask(task)
    .then(() => {
      if (options.autoSave !== false && previous?.status !== 'done' && task.status === 'done') {
        void autoSaveTaskToCloud(task)
      }
    })
    .catch((err) => console.error('保存任务失败：', err))
}
