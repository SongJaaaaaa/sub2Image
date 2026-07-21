import type { TaskRecord } from '../types'
import { deleteVideo } from '../lib/db'
import { useStore } from '../state/appStore'

export function addTaskVideoReferences(ids: Set<string>, task: TaskRecord) {
  for (const id of task.outputVideoIds || []) ids.add(id)
}

export async function deleteUnreferencedVideoIds(videoIds: Iterable<string>) {
  const ids = new Set(Array.from(videoIds).filter(Boolean))
  if (!ids.size) return
  const used = new Set<string>()
  for (const task of useStore.getState().tasks) addTaskVideoReferences(used, task)
  for (const id of ids) {
    if (!used.has(id)) await deleteVideo(id)
  }
}
