import type { TaskRecord } from './types'
import { deleteFavoriteCollection as deleteFavoriteCollectionAction } from './features/favorites'
import { deleteImageIfUnreferenced as deleteUnreferencedImage } from './features/imageLibrary'
import {
  clearCustomRecoveryTimer,
  clearFalRecoveryTimer,
  clearFailedTasks as clearFailedTaskActions,
  editOutputs as editTaskOutputs,
  executeTask as executeTaskRequest,
  removeMultipleTasks as removeMultipleTaskActions,
  removeTask as removeTaskAction,
  retryTask as retryTaskAction,
  reuseConfig as reuseTaskConfig,
  scheduleCustomRecovery,
  scheduleFalRecovery,
  submitTask as submitTaskAction,
  type SubmitTaskOptions,
} from './features/tasks'
import {
  continueRecoveredAgentRound as continueRecoveredAgentRoundAction,
  executeAgentRound,
  scrubAgentOutputPayloadsForDeletedTasks,
} from './features/agent'
import { applyComposerDraft } from './integrations/conversation/composerDraft'
import { useStore } from './state/appStore'
import { initAppState } from './state/initAppState'

async function continueRecoveredAgentRound(taskId: string) {
  await continueRecoveredAgentRoundAction(taskId, executeAgentRound)
}

async function executeTask(taskId: string, signal?: AbortSignal) {
  await executeTaskRequest(taskId, signal, {
    clearFalRecoveryTimer,
    scheduleFalRecovery: (id) => scheduleFalRecovery(id, continueRecoveredAgentRound),
    clearCustomRecoveryTimer,
    scheduleCustomRecovery: (id) => scheduleCustomRecovery(id, continueRecoveredAgentRound),
  })
}

export async function initStore() {
  await initAppState(continueRecoveredAgentRound)
}

export async function deleteImageIfUnreferenced(imageId: string) {
  await deleteUnreferencedImage(imageId, useStore.getState())
}

export async function submitTask(options: SubmitTaskOptions = {}) {
  await submitTaskAction(options, executeTask)
}

export async function deleteFavoriteCollection(collectionId: string, deleteTasks = false) {
  await deleteFavoriteCollectionAction(collectionId, deleteTasks, removeMultipleTasks)
}

export async function retryTask(task: TaskRecord) {
  await retryTaskAction(task, executeTask)
}

export async function reuseConfig(task: TaskRecord) {
  await reuseTaskConfig(task, applyComposerDraft, submitTask)
}

export async function editOutputs(task: TaskRecord) {
  await editTaskOutputs(task)
}

export async function removeMultipleTasks(taskIds: string[]) {
  await removeMultipleTaskActions(taskIds, scrubAgentOutputPayloadsForDeletedTasks)
}

export async function clearFailedTasks(taskIds?: string[]) {
  await clearFailedTaskActions(taskIds, removeMultipleTasks)
}

export async function removeTask(task: TaskRecord) {
  await removeTaskAction(task, scrubAgentOutputPayloadsForDeletedTasks)
}
