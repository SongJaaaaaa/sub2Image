import type { TaskRecord } from '../../types'
import type { AppState } from '../../state/types'

export const SUPPORT_PROMPT_IMAGE_THRESHOLD = 50

export function isAgentTask(task: TaskRecord) {
  return task.sourceMode === 'agent' || Boolean(task.agentConversationId || task.agentRoundId)
}

export function countSuccessfulOutputImages(tasks: TaskRecord[]) {
  return tasks.reduce((count, task) => count + (task.status === 'done' && !isAgentTask(task) ? task.outputImages.length : 0), 0)
}

export function taskHasOutputErrors(task: Pick<TaskRecord, 'outputErrors'>) {
  return Boolean(task.outputErrors?.length)
}

export function taskMatchesFilterStatus(task: TaskRecord, filterStatus: AppState['filterStatus']) {
  if (filterStatus === 'all') return true
  if (filterStatus === 'error') return task.status === 'error' || taskHasOutputErrors(task)
  return task.status === filterStatus
}

export function taskMatchesSearchQuery(task: TaskRecord, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const prompt = (task.prompt || '').toLowerCase()
  const params = JSON.stringify(task.params).toLowerCase()
  const error = [task.error, ...(task.outputErrors ?? []).map((item) => item.error)].filter(Boolean).join('\n').toLowerCase()
  return prompt.includes(q) || params.includes(q) || error.includes(q)
}
