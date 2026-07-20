import type { TaskRecord } from '../../types'
import { normalizeFavoritePatch } from '../favorites/favoriteTaskState'
import { useStore } from '../../state/appStore'
import { putTask } from './taskPersistence'
import { maybeOpenSupportPrompt } from './taskSupportPrompt'

export function updateTaskInStore(taskId: string, patch: Partial<TaskRecord>) {
  const { tasks, setTasks, defaultFavoriteCollectionId } = useStore.getState()
  const updated = tasks.map((task) =>
    task.id === taskId ? { ...task, ...normalizeFavoritePatch(task, patch, defaultFavoriteCollectionId) } : task,
  )
  const task = updated.find((item) => item.id === taskId)
  setTasks(updated)
  maybeOpenSupportPrompt(tasks, updated, taskId)
  if (task) void putTask(task)
}
