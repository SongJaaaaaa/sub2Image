import { callImageApi } from '../../integrations/imageApi'
import { getActiveApiProfile } from '../../lib/apiProfiles'
import { IMAGE_FETCH_CORS_HINT } from '../../integrations/imageApi'
import { replaceImageMentionsForApi } from '../../lib/promptImageMentions'
import { ensureImageCached, removeCachedImage } from '../imageLibrary'
import { useStore } from '../../state/appStore'
import { updateTaskInStore } from './taskActions'
import { showCodexCliPrompt } from './taskCodexPrompt'
import { getApiRequestNetworkErrorHint, getRawErrorPayload, isNetworkRecoverableError } from './taskErrors'
import { showTaskCompletionNotification } from './taskNotifications'
import { deleteUnreferencedImageIds, persistTaskStreamPartialImage, storeTaskOutputImages } from './taskOutputStorage'
import { firstActualParams, mapActualParamsByImage, resolveImageSizeParamsList } from './taskParams'
import { createSettingsForApiProfile, getTaskApiProfile, isAsyncCustomProviderTask, usesConcurrentOpenAIImageRequests } from './taskProfiles'
import { clearOpenAIWatchdogTimer, scheduleOpenAIWatchdog } from './taskRecovery'
import { isAgentTask } from './taskSelectors'

export type TaskRecoveryHandlers = {
  clearFalRecoveryTimer: (taskId: string) => void
  scheduleFalRecovery: (taskId: string) => void
  clearCustomRecoveryTimer: (taskId: string) => void
  scheduleCustomRecovery: (taskId: string) => void
}

export async function executeTask(taskId: string, signal: AbortSignal | undefined, recovery: TaskRecoveryHandlers) {
  const { settings } = useStore.getState()
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task) return
  const taskProfile = getTaskApiProfile(settings, task)
  if (!taskProfile && task.apiProfileId) {
    updateTaskInStore(taskId, {
      status: 'error',
      error: '找不到此任务所使用的 API 配置。',
      falRecoverable: false,
      customRecoverable: false,
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })
    return
  }
  const activeProfile = taskProfile ?? getActiveApiProfile(settings)
  const requestSettings = createSettingsForApiProfile(settings, activeProfile)
  const taskProvider = task.apiProvider ?? activeProfile.provider
  let falRequestInfo: { requestId: string; endpoint: string } | null = task.falRequestId && task.falEndpoint
    ? { requestId: task.falRequestId, endpoint: task.falEndpoint }
    : null
  let customTaskInfo: { taskId: string } | null = task.customTaskId
    ? { taskId: task.customTaskId }
    : null

  if (
    taskProvider !== 'fal' &&
    !isAsyncCustomProviderTask(requestSettings, taskProvider, task.inputImageIds.length > 0) &&
    !usesConcurrentOpenAIImageRequests(activeProfile, task.params)
  ) {
    scheduleOpenAIWatchdog(taskId, activeProfile.timeout, activeProfile)
  }

  try {
    signal?.throwIfAborted()
    const inputDataUrls: string[] = []
    for (const id of task.inputImageIds) {
      const dataUrl = await ensureImageCached(id)
      if (!dataUrl) throw new Error('输入图片已不存在')
      inputDataUrls.push(dataUrl)
      signal?.throwIfAborted()
    }
    let maskDataUrl: string | undefined
    if (task.maskImageId) {
      maskDataUrl = await ensureImageCached(task.maskImageId)
      if (!maskDataUrl) throw new Error('遮罩图片已不存在')
      signal?.throwIfAborted()
    }

    const requestPrompt = task.transparentOutput && task.transparentPrompt
      ? task.transparentPrompt
      : task.prompt
    const result = await callImageApi({
      settings: requestSettings,
      prompt: replaceImageMentionsForApi(requestPrompt, inputDataUrls.length),
      params: task.params,
      inputImageDataUrls: inputDataUrls,
      maskDataUrl,
      signal,
      onFalRequestEnqueued: (request) => {
        if (signal?.aborted) return
        falRequestInfo = request
        updateTaskInStore(taskId, {
          falRequestId: request.requestId,
          falEndpoint: request.endpoint,
          falRecoverable: false,
        })
      },
      onCustomTaskEnqueued: (request) => {
        if (signal?.aborted) return
        customTaskInfo = request
        updateTaskInStore(taskId, {
          customTaskId: request.taskId,
          customRecoverable: false,
        })
      },
      onPartialImage: (partial) => {
        if (signal?.aborted) return
        const current = useStore.getState().tasks.find((item) => item.id === taskId)
        if (current?.status !== 'running') return
        useStore.getState().setTaskStreamPreview(taskId, partial.image, partial.requestIndex)
        void persistTaskStreamPartialImage(taskId, partial.image)
      },
    })
    signal?.throwIfAborted()

    const latestBeforeSuccess = useStore.getState().tasks.find((item) => item.id === taskId)
    if (!latestBeforeSuccess || latestBeforeSuccess.status !== 'running') {
      useStore.getState().setTaskStreamPreview(taskId)
      return
    }

    const { outputIds, outputDataUrls, outputImageSizes, transparentOriginalImageIds } = await storeTaskOutputImages(task, result.images)
    if (signal?.aborted) {
      await deleteUnreferencedImageIds([...outputIds, ...(transparentOriginalImageIds ?? [])])
      signal.throwIfAborted()
    }
    const isAsyncCustomTask = taskProvider !== 'fal' && taskProvider !== 'openai' && Boolean(customTaskInfo)
    const actualParamsList = await resolveImageSizeParamsList(
      outputDataUrls,
      isAsyncCustomTask ? undefined : result.actualParamsList,
      outputImageSizes,
    )
    if (signal?.aborted) {
      await deleteUnreferencedImageIds([...outputIds, ...(transparentOriginalImageIds ?? [])])
      signal.throwIfAborted()
    }
    const actualParams = (() => {
      if (taskProvider === 'fal') return firstActualParams(actualParamsList)
      if (isAsyncCustomTask) return firstActualParams(actualParamsList)
      const firstParams = firstActualParams(actualParamsList)
      return {
        ...result.actualParams,
        size: result.actualParams?.size ?? firstParams?.size,
        n: outputIds.length,
      }
    })()
    const shouldStoreRevisedPrompts = taskProvider !== 'fal' && !isAsyncCustomTask
    const actualParamsByImage = mapActualParamsByImage(outputIds, actualParamsList)
    const revisedPromptByImage = shouldStoreRevisedPrompts ? result.revisedPrompts?.reduce<Record<string, string>>((acc, revisedPrompt, idx) => {
      const id = outputIds[idx]
      if (id && revisedPrompt && revisedPrompt.trim()) acc[id] = revisedPrompt
      return acc
    }, {}) : undefined
    const promptWasRevised = shouldStoreRevisedPrompts && result.revisedPrompts?.some(
      (revisedPrompt) => revisedPrompt?.trim() && revisedPrompt.trim() !== requestPrompt.trim(),
    )
    const hasRevisedPromptValue = shouldStoreRevisedPrompts && result.revisedPrompts?.some((revisedPrompt) => revisedPrompt?.trim())
    if (taskProvider === 'openai' && activeProfile.apiMode === 'responses' && !activeProfile.codexCli) {
      if (promptWasRevised) {
        showCodexCliPrompt()
      } else if (!hasRevisedPromptValue) {
        showCodexCliPrompt(false, '接口没有返回官方 API 会返回的部分信息')
      }
    }

    const latestBeforeUpdate = useStore.getState().tasks.find((item) => item.id === taskId)
    if (!latestBeforeUpdate || latestBeforeUpdate.status !== 'running') {
      useStore.getState().setTaskStreamPreview(taskId)
      await deleteUnreferencedImageIds([...outputIds, ...(transparentOriginalImageIds ?? [])])
      return
    }
    const partialImageIdsToClean = latestBeforeUpdate.streamPartialImageIds || []
    clearOpenAIWatchdogTimer(taskId)
    useStore.getState().setTaskStreamPreview(taskId)
    updateTaskInStore(taskId, {
      outputImages: outputIds,
      transparentOriginalImages: transparentOriginalImageIds,
      outputErrors: result.failedRequests?.length ? result.failedRequests : undefined,
      streamPartialImageIds: undefined,
      rawImageUrls: result.rawImageUrls?.length ? result.rawImageUrls : undefined,
      actualParams,
      actualParamsByImage,
      revisedPromptByImage: revisedPromptByImage && Object.keys(revisedPromptByImage).length > 0 ? revisedPromptByImage : undefined,
      status: 'done',
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
      falRecoverable: false,
      customRecoverable: false,
    })
    void deleteUnreferencedImageIds(partialImageIdsToClean)

    const failedCount = result.failedRequests?.length ?? 0
    const completionMessage = failedCount > 0
      ? `生成完成：成功 ${outputIds.length} 张，失败 ${failedCount} 张`
      : `生成完成，共 ${outputIds.length} 张图片`
    useStore.getState().showToast(completionMessage, failedCount > 0 ? 'error' : 'success')
    if (!isAgentTask(task)) showTaskCompletionNotification('图像生成完成', `${completionMessage}。`)
    const currentMask = useStore.getState().maskDraft
    if (
      maskDataUrl &&
      currentMask &&
      currentMask.targetImageId === task.maskTargetImageId &&
      currentMask.maskDataUrl === maskDataUrl
    ) {
      useStore.getState().clearMaskDraft()
    }
  } catch (err) {
    clearOpenAIWatchdogTimer(taskId)
    const latestTask = useStore.getState().tasks.find((item) => item.id === taskId) ?? task
    if (signal?.aborted) {
      recovery.clearFalRecoveryTimer(taskId)
      recovery.clearCustomRecoveryTimer(taskId)
      useStore.getState().setTaskStreamPreview(taskId)
      if (latestTask.status === 'running') {
        updateTaskInStore(taskId, {
          status: 'error',
          error: '已停止生成。',
          falRecoverable: false,
          customRecoverable: false,
          finishedAt: Date.now(),
          elapsed: Date.now() - task.createdAt,
        })
        useStore.getState().showToast('已停止生成', 'info')
      }
      return
    }
    if (latestTask.status !== 'running') return
    useStore.getState().setTaskStreamPreview(taskId)
    const latestFalRequestInfo = falRequestInfo ?? (latestTask.falRequestId && latestTask.falEndpoint
      ? { requestId: latestTask.falRequestId, endpoint: latestTask.falEndpoint }
      : null)
    const latestCustomTaskInfo = customTaskInfo ?? (latestTask.customTaskId ? { taskId: latestTask.customTaskId } : null)
    if (latestTask.apiProvider === 'fal' && latestFalRequestInfo && isNetworkRecoverableError(err)) {
      updateTaskInStore(taskId, {
        status: 'error',
        error: '与 fal.ai 的连接已断开，之后会继续查询任务结果。',
        falRequestId: latestFalRequestInfo.requestId,
        falEndpoint: latestFalRequestInfo.endpoint,
        falRecoverable: true,
        finishedAt: Date.now(),
        elapsed: Date.now() - task.createdAt,
      })
      recovery.scheduleFalRecovery(taskId)
    } else if (latestCustomTaskInfo && isNetworkRecoverableError(err)) {
      updateTaskInStore(taskId, {
        status: 'error',
        error: '与自定义异步任务的连接已断开，之后会继续查询任务结果。',
        customTaskId: latestCustomTaskInfo.taskId,
        customRecoverable: true,
        finishedAt: Date.now(),
        elapsed: Date.now() - task.createdAt,
      })
      recovery.scheduleCustomRecovery(taskId)
    } else {
      let errorMessage = err instanceof Error ? err.message : String(err)
      const settings = useStore.getState().settings
      const profile = getTaskApiProfile(settings, latestTask)
      const usesApiProxy = profile?.apiProxy ?? settings.apiProxy
      const activeProfile = getActiveApiProfile(settings)
      const hintProfile = profile ?? {
        provider: latestTask.apiProvider ?? activeProfile.provider,
        apiMode: settings.apiMode,
        streamImages: activeProfile.streamImages,
        streamPartialImages: activeProfile.streamPartialImages,
      }
      const networkErrorHint = getApiRequestNetworkErrorHint(err, latestTask.createdAt, usesApiProxy, hintProfile)
      if (networkErrorHint && !errorMessage.includes(IMAGE_FETCH_CORS_HINT)) errorMessage += `\n${networkErrorHint}`
      updateTaskInStore(taskId, {
        status: 'error',
        error: errorMessage,
        ...getRawErrorPayload(err),
        falRecoverable: false,
        customRecoverable: false,
        finishedAt: Date.now(),
        elapsed: Date.now() - task.createdAt,
      })
      useStore.getState().setDetailTaskId(taskId)
    }
  } finally {
    // 输入图片已持久化到 IndexedDB，释放内存缓存后可按需重新加载。
    for (const id of task.inputImageIds) removeCachedImage(id)
  }
}
