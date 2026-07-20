import type { ApiProfile, TaskRecord } from '../../types'
import { getCustomProviderDefinition } from '../../lib/apiProfiles'
import { getCustomQueuedImageResult, getFalErrorMessage, getFalQueuedImageResult } from '../../integrations/imageApi'
import { useStore } from '../../state/appStore'
import { updateTaskInStore } from './taskActions'
import { createOpenAITimeoutError, getRawErrorPayload, isNetworkRecoverableError } from './taskErrors'
import { showTaskCompletionNotification } from './taskNotifications'
import { deleteUnreferencedImageIds, storeTaskOutputImages } from './taskOutputStorage'
import { firstActualParams, mapActualParamsByImage, resolveImageSizeParamsList } from './taskParams'
import { getTaskApiProfile } from './taskProfiles'
import { isAgentTask } from './taskSelectors'

const OPENAI_INTERRUPTED_ERROR = '请求中断'
const AGENT_STOPPED_MESSAGE = '已停止生成。'
const FAL_RECOVERY_POLL_MS = 10_000
const CUSTOM_RECOVERY_POLL_MS = 10_000
const openAIWatchdogTimers = new Map<string, ReturnType<typeof setTimeout>>()
const falRecoveryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const customRecoveryTimers = new Map<string, ReturnType<typeof setTimeout>>()

type ContinueRecoveredAgentRound = (taskId: string) => void | Promise<void>

function isOpenAITask(task: TaskRecord) {
  return (task.apiProvider ?? 'openai') !== 'fal'
}

export function isRunningOpenAITask(task: TaskRecord) {
  return task.status === 'running' && isOpenAITask(task)
}

export function markInterruptedOpenAIRunningTasks(tasks: TaskRecord[], now = Date.now()) {
  const interruptedTasks: TaskRecord[] = []
  const updatedTasks = tasks.map((task) => {
    if (!isRunningOpenAITask(task) || task.customTaskId) return task

    const updated: TaskRecord = {
      ...task,
      status: 'error',
      error: OPENAI_INTERRUPTED_ERROR,
      falRecoverable: false,
      finishedAt: now,
      elapsed: Math.max(0, now - task.createdAt),
    }
    interruptedTasks.push(updated)
    return updated
  })

  return { tasks: updatedTasks, interruptedTasks }
}

export function clearOpenAIWatchdogTimer(taskId: string) {
  const timer = openAIWatchdogTimers.get(taskId)
  if (timer) clearTimeout(timer)
  openAIWatchdogTimers.delete(taskId)
}

function failOpenAITaskIfStillRunning(taskId: string, error: string, now = Date.now()) {
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task || !isRunningOpenAITask(task)) return false
  updateTaskInStore(taskId, {
    status: 'error',
    error,
    falRecoverable: false,
    finishedAt: now,
    elapsed: Math.max(0, now - task.createdAt),
  })
  return true
}

export function scheduleOpenAIWatchdog(taskId: string, timeoutSeconds: number, profile?: Pick<ApiProfile, 'provider' | 'streamImages' | 'streamPartialImages'> | null) {
  clearOpenAIWatchdogTimer(taskId)
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task || !isRunningOpenAITask(task)) return
  const timeoutMs = Math.max(0, timeoutSeconds * 1000)
  const remainingMs = Math.max(0, timeoutMs - (Date.now() - task.createdAt))
  const timer = setTimeout(() => {
    openAIWatchdogTimers.delete(taskId)
    const failed = failOpenAITaskIfStillRunning(taskId, createOpenAITimeoutError(timeoutSeconds, profile))
    if (failed) useStore.getState().showToast('OpenAI 任务请求超时', 'error')
  }, remainingMs)
  openAIWatchdogTimers.set(taskId, timer)
}

function getFalRecoveryProfile(settings: Parameters<typeof getTaskApiProfile>[0], task: TaskRecord) {
  const profile = getTaskApiProfile(settings, task)
  return profile?.provider === 'fal' ? profile : null
}

function getCustomRecoveryProfile(settings: Parameters<typeof getTaskApiProfile>[0], task: TaskRecord) {
  const provider = task.apiProvider
  if (!provider || provider === 'openai' || provider === 'fal') return null
  const profile = getTaskApiProfile(settings, task)
  return profile?.provider === provider ? profile : null
}

export function clearFalRecoveryTimer(taskId: string) {
  const timer = falRecoveryTimers.get(taskId)
  if (timer) clearTimeout(timer)
  falRecoveryTimers.delete(taskId)
}

export function scheduleFalRecovery(taskId: string, continueAgentRound: ContinueRecoveredAgentRound, delayMs = FAL_RECOVERY_POLL_MS) {
  if (falRecoveryTimers.has(taskId)) return
  const timer = setTimeout(() => {
    falRecoveryTimers.delete(taskId)
    void recoverFalTask(taskId, continueAgentRound)
  }, delayMs)
  falRecoveryTimers.set(taskId, timer)
}

export function clearCustomRecoveryTimer(taskId: string) {
  const timer = customRecoveryTimers.get(taskId)
  if (timer) clearTimeout(timer)
  customRecoveryTimers.delete(taskId)
}

export function scheduleCustomRecovery(taskId: string, continueAgentRound: ContinueRecoveredAgentRound, delayMs = CUSTOM_RECOVERY_POLL_MS) {
  if (customRecoveryTimers.has(taskId)) return
  const timer = setTimeout(() => {
    customRecoveryTimers.delete(taskId)
    void recoverCustomTask(taskId, continueAgentRound)
  }, delayMs)
  customRecoveryTimers.set(taskId, timer)
}

async function completeRecoveredFalTask(task: TaskRecord, result: Awaited<ReturnType<typeof getFalQueuedImageResult>>, continueAgentRound: ContinueRecoveredAgentRound) {
  const latest = useStore.getState().tasks.find((item) => item.id === task.id)
  if (!latest || latest.status === 'done' || latest.error === AGENT_STOPPED_MESSAGE) return
  if (latest.status !== 'running' && !latest.falRecoverable) return

  const { outputIds, outputDataUrls, outputImageSizes, transparentOriginalImageIds } = await storeTaskOutputImages(task, result.images)
  const actualParamsList = await resolveImageSizeParamsList(outputDataUrls, result.actualParamsList, outputImageSizes)
  const latestBeforeUpdate = useStore.getState().tasks.find((item) => item.id === task.id)
  if (!latestBeforeUpdate || latestBeforeUpdate.status === 'done' || latestBeforeUpdate.error === AGENT_STOPPED_MESSAGE || (latestBeforeUpdate.status !== 'running' && !latestBeforeUpdate.falRecoverable)) {
    await deleteUnreferencedImageIds([...outputIds, ...(transparentOriginalImageIds ?? [])])
    return
  }

  updateTaskInStore(task.id, {
    outputImages: outputIds,
    transparentOriginalImages: transparentOriginalImageIds,
    actualParams: firstActualParams(actualParamsList),
    actualParamsByImage: mapActualParamsByImage(outputIds, actualParamsList),
    revisedPromptByImage: undefined,
    status: 'done',
    error: null,
    falRecoverable: false,
    finishedAt: Date.now(),
    elapsed: Date.now() - task.createdAt,
  })
  useStore.getState().showToast(`fal.ai 任务已恢复，共 ${outputIds.length} 张图片`, 'success')
  if (!isAgentTask(task)) showTaskCompletionNotification('图像生成完成', `fal.ai 任务已恢复，共 ${outputIds.length} 张图片。`)
  else void continueAgentRound(task.id)
}

async function recoverFalTask(taskId: string, continueAgentRound: ContinueRecoveredAgentRound) {
  const { settings, tasks } = useStore.getState()
  const task = tasks.find((item) => item.id === taskId)
  if (!task || task.apiProvider !== 'fal' || !task.falRequestId || !task.falEndpoint || task.status === 'done') return

  const profile = getFalRecoveryProfile(settings, task)
  if (!profile) {
    scheduleFalRecovery(taskId, continueAgentRound)
    return
  }

  try {
    const result = await getFalQueuedImageResult(profile, task.falEndpoint, task.falRequestId, task.params)
    clearFalRecoveryTimer(taskId)
    await completeRecoveredFalTask(task, result, continueAgentRound)
  } catch (err) {
    const latest = useStore.getState().tasks.find((item) => item.id === taskId)
    if (!latest || latest.status === 'done' || latest.error === AGENT_STOPPED_MESSAGE || (latest.status !== 'running' && !latest.falRecoverable)) {
      clearFalRecoveryTimer(taskId)
      return
    }
    if (isNetworkRecoverableError(err)) {
      scheduleFalRecovery(taskId, continueAgentRound)
      return
    }
    clearFalRecoveryTimer(taskId)
    updateTaskInStore(taskId, {
      status: 'error',
      error: getFalErrorMessage(err) ?? (err instanceof Error ? err.message : String(err)),
      ...getRawErrorPayload(err),
      falRecoverable: false,
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })
    if (isAgentTask(task)) void continueAgentRound(taskId)
  }
}

async function completeRecoveredCustomTask(task: TaskRecord, result: Awaited<ReturnType<typeof getCustomQueuedImageResult>>, continueAgentRound: ContinueRecoveredAgentRound) {
  const latest = useStore.getState().tasks.find((item) => item.id === task.id)
  if (!latest || latest.status === 'done' || latest.error === AGENT_STOPPED_MESSAGE) return
  if (latest.status !== 'running' && !latest.customRecoverable) return

  const { outputIds, outputDataUrls, outputImageSizes, transparentOriginalImageIds } = await storeTaskOutputImages(task, result.images)
  const actualParamsList = await resolveImageSizeParamsList(outputDataUrls, undefined, outputImageSizes)
  const latestBeforeUpdate = useStore.getState().tasks.find((item) => item.id === task.id)
  if (!latestBeforeUpdate || latestBeforeUpdate.status === 'done' || latestBeforeUpdate.error === AGENT_STOPPED_MESSAGE || (latestBeforeUpdate.status !== 'running' && !latestBeforeUpdate.customRecoverable)) {
    await deleteUnreferencedImageIds([...outputIds, ...(transparentOriginalImageIds ?? [])])
    return
  }

  updateTaskInStore(task.id, {
    outputImages: outputIds,
    transparentOriginalImages: transparentOriginalImageIds,
    actualParams: firstActualParams(actualParamsList),
    actualParamsByImage: mapActualParamsByImage(outputIds, actualParamsList),
    revisedPromptByImage: undefined,
    status: 'done',
    error: null,
    customRecoverable: false,
    finishedAt: Date.now(),
    elapsed: Date.now() - task.createdAt,
  })
  useStore.getState().showToast(`自定义异步任务已恢复，共 ${outputIds.length} 张图片`, 'success')
  if (!isAgentTask(task)) showTaskCompletionNotification('图像生成完成', `自定义异步任务已恢复，共 ${outputIds.length} 张图片。`)
  else void continueAgentRound(task.id)
}

async function recoverCustomTask(taskId: string, continueAgentRound: ContinueRecoveredAgentRound) {
  const { settings, tasks } = useStore.getState()
  const task = tasks.find((item) => item.id === taskId)
  if (!task || !task.customTaskId || task.status === 'done') return

  const profile = getCustomRecoveryProfile(settings, task)
  const customProvider = task.apiProvider ? getCustomProviderDefinition(settings, task.apiProvider) : null
  if (!profile || !customProvider?.poll) {
    scheduleCustomRecovery(taskId, continueAgentRound)
    return
  }

  try {
    const result = await getCustomQueuedImageResult(profile, customProvider, task.customTaskId, task.params)
    clearCustomRecoveryTimer(taskId)
    await completeRecoveredCustomTask(task, result, continueAgentRound)
  } catch (err) {
    clearCustomRecoveryTimer(taskId)
    const latest = useStore.getState().tasks.find((item) => item.id === taskId)
    if (!latest || latest.status === 'done' || latest.error === AGENT_STOPPED_MESSAGE || (latest.status !== 'running' && !latest.customRecoverable)) return
    updateTaskInStore(taskId, {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      ...getRawErrorPayload(err),
      customRecoverable: false,
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })
    if (isAgentTask(task)) void continueAgentRound(taskId)
  }
}
