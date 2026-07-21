import type {
  AgentMessage,
  ApiProfile,
  AppSettings,
  ResponsesOutputItem,
  TaskParams,
  TaskRecord,
} from '../../types'
import { DEFAULT_AGENT_MAX_TOOL_ROUNDS } from '../../types'
import { callImageApi } from '../../integrations/imageApi'
import {
  callAgentResponsesApi,
  callBatchImageSingle,
  parseBatchImageCallArguments,
  type AgentApiResultImage,
} from '../../integrations/conversation/agentApi'
import {
  collectAgentRoundOutputImageSlots,
  extractAgentReferenceIds,
  getAgentCurrentReferenceId,
  getAgentGeneratedImageReferenceId,
} from '../../lib/agentImageReferences'
import { storeImageWithSize } from '../../lib/db'
import { genId } from '../../lib/id'
import { IMAGE_FETCH_CORS_HINT } from '../../integrations/imageApi'
import { normalizeParamsForSettings } from '../../lib/paramCompatibility'
import { replaceImageMentionsForApi } from '../../lib/promptImageMentions'
import { getAgentSkillInstructions } from '../../Skills'
import { useStore } from '../../state/appStore'
import { cacheImage, ensureImageCached } from '../imageLibrary'
import { updateTaskInStore } from '../tasks/taskActions'
import {
  getApiRequestNetworkErrorHint,
  getRawErrorPayload,
  isNetworkRecoverableError,
} from '../tasks/taskErrors'
import { showTaskCompletionNotification } from '../tasks/taskNotifications'
import { persistTaskStreamPartialImage } from '../tasks/taskOutputStorage'
import { getImageSizeParam, hasActualSizeParam } from '../tasks/taskParams'
import { putTask } from '../tasks/taskPersistence'
import { createSettingsForApiProfile } from '../tasks/taskProfiles'
import { scheduleCustomRecovery, scheduleFalRecovery } from '../tasks/taskRecovery'
import {
  buildAgentApiInput,
  buildAgentContinuationInput,
  countResponseToolCalls,
  createAgentBatchImagesInputItem,
  mergeResponseOutputItems,
} from './agentInput'
import { continueRecoveredAgentRound as continueRecoveredAgentRoundAction } from './agentRecovery'
import { getAgentRoundPath, uniqueIds } from './agentRounds'
import {
  agentRoundControllers,
  appendAgentAssistantMessageContent,
  createAgentAbortError,
  createAgentRecoveryPauseError,
  getAgentRoundControllerKey,
  isAgentRecoveryPauseError,
  markAgentRoundStopped,
  markAgentRoundTasksFailed,
  updateAgentConversation,
} from './agentRuntimeState'

async function continueRecoveredAgentRound(taskId: string) {
  await continueRecoveredAgentRoundAction(taskId, executeAgentRound)
}

export async function executeAgentRound(
  conversationId: string,
  roundId: string,
  params: TaskParams,
  requestSettings: AppSettings,
  activeProfile: ApiProfile,
  imageProfile: ApiProfile,
  resume?: { responseOutput: ResponsesOutputItem[]; recoveredTaskIds: string[]; toolCallsUsed: number },
  externalSignal?: AbortSignal,
) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) abortFromCaller()
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
  const controllerKey = getAgentRoundControllerKey(conversationId, roundId)
  agentRoundControllers.set(controllerKey, controller)
  try {
    const latestState = useStore.getState()
    const conversation = latestState.agentConversations.find((item) => item.id === conversationId)
    if (!conversation) return
    const round = conversation.rounds.find((item) => item.id === roundId)
    const userMessage = round ? conversation.messages.find((message) => message.id === round.userMessageId) : null
    if (!round || !userMessage) return
    const skillInstructions = getAgentSkillInstructions(round.skill)
    if (round.skill && !skillInstructions) console.warn(`Agent Skill 不可用或版本不匹配：${round.skill.id}@${round.skill.version}`)
    const maskDataUrl = round.maskImageId ? await ensureImageCached(round.maskImageId) : undefined
    if (round.maskImageId && !maskDataUrl) throw new Error('遮罩图片已不存在')

    const apiInput = await buildAgentApiInput(conversation, round, latestState.tasks)
    if (controller.signal.aborted) throw createAgentAbortError()
    const existingAssistantMessage = round.assistantMessageId
      ? conversation.messages.find((message) => message.id === round.assistantMessageId) ?? null
      : conversation.messages.find((message) => message.roundId === roundId && message.role === 'assistant') ?? null
    const assistantMessageId = existingAssistantMessage?.id ?? genId()
    const resumedAssistantContent = resume ? existingAssistantMessage?.content.trim() ?? '' : ''
    const shouldStreamAssistantMessage = activeProfile.streamImages === true
    const imageRequestSettings = createSettingsForApiProfile(requestSettings, imageProfile)
    const streamingTaskIds: string[] = resume ? [...round.outputTaskIds] : []
    const taskIdByToolCallId = new Map<string, string>()

    const attachTaskToAgentRound = (taskId: string) => {
      if (streamingTaskIds.includes(taskId)) return
      streamingTaskIds.push(taskId)
      updateAgentConversation(conversationId, (current) => ({
        ...current,
        updatedAt: Date.now(),
        rounds: current.rounds.map((item) =>
          item.id === roundId
            ? { ...item, outputTaskIds: item.outputTaskIds.includes(taskId) ? item.outputTaskIds : [...item.outputTaskIds, taskId] }
            : item,
        ),
        messages: current.messages.map((message) =>
          message.id === assistantMessageId
            ? { ...message, outputTaskIds: [...new Set([...(message.outputTaskIds ?? []), taskId])] }
            : message,
        ),
      }))
    }

    const ensureStreamingAgentTask = async (
      toolCallId: string,
      taskPrompt = '',
      inputImageIds = round.inputImageIds ?? [],
      options: { createdAt?: number; agentBatchCallId?: string; maskTargetImageId?: string | null; maskImageId?: string | null; taskParams?: TaskParams } = {},
    ) => {
      const existingTaskId = taskIdByToolCallId.get(toolCallId)
      if (existingTaskId) return existingTaskId

      const existingTask = useStore.getState().tasks.find((task) => task.agentToolCallId === toolCallId)
      if (existingTask) {
        taskIdByToolCallId.set(toolCallId, existingTask.id)
        attachTaskToAgentRound(existingTask.id)
        return existingTask.id
      }

      const task: TaskRecord = {
        id: genId(),
        prompt: taskPrompt,
        params: options.taskParams ?? { ...params, n: 1 },
        apiProvider: imageProfile.provider,
        apiProfileId: imageProfile.id,
        apiProfileName: imageProfile.name,
        apiMode: imageProfile.apiMode,
        apiModel: imageProfile.model,
        inputImageIds,
        maskTargetImageId: options.maskTargetImageId !== undefined ? options.maskTargetImageId : round.maskTargetImageId ?? null,
        maskImageId: options.maskImageId !== undefined ? options.maskImageId : round.maskImageId ?? null,
        outputImages: [],
        status: 'running',
        error: null,
        createdAt: options.createdAt ?? Date.now(),
        finishedAt: null,
        elapsed: null,
        sourceMode: 'agent',
        agentConversationId: conversationId,
        agentRoundId: roundId,
        agentMessageId: assistantMessageId,
        agentToolCallId: toolCallId,
        ...(options.agentBatchCallId ? { agentBatchCallId: options.agentBatchCallId } : {}),
      }

      taskIdByToolCallId.set(toolCallId, task.id)
      useStore.getState().setTasks([task, ...useStore.getState().tasks])
      attachTaskToAgentRound(task.id)
      await putTask(task)
      return task.id
    }

    const completeAgentImageTask = async (image: AgentApiResultImage, rawResponsePayload?: string) => {
      const toolCallId = image.toolCallId ?? genId()
      const taskId = await ensureStreamingAgentTask(toolCallId)
      const latestTask = useStore.getState().tasks.find((task) => task.id === taskId)
      if (latestTask?.status === 'done' && latestTask.outputImages.length > 0) return taskId

      const stored = await storeImageWithSize(image.dataUrl, 'generated')
      cacheImage(stored.id, image.dataUrl)
      const actualParams: Partial<TaskParams> = {
        ...(Object.keys(image.actualParams ?? {}).length ? image.actualParams : {}),
        ...(!hasActualSizeParam(image.actualParams) ? getImageSizeParam(stored) ?? {} : {}),
        n: 1,
      }
      updateTaskInStore(taskId, {
        prompt: image.revisedPrompt ?? latestTask?.prompt ?? '',
        outputImages: [stored.id],
        actualParams,
        actualParamsByImage: { [stored.id]: actualParams },
        revisedPromptByImage: image.revisedPrompt ? { [stored.id]: image.revisedPrompt } : undefined,
        rawResponsePayload,
        status: 'done',
        error: null,
        finishedAt: Date.now(),
        elapsed: Date.now() - (latestTask?.createdAt ?? startedAt),
        agentToolAction: image.action,
      })
      useStore.getState().setTaskStreamPreview(taskId)
      return taskId
    }

    const failAgentImageTask = (toolCallId: string, error: string, rawResponsePayload?: string) => {
      const taskId = taskIdByToolCallId.get(toolCallId)
      if (!taskId) return
      const latestTask = useStore.getState().tasks.find((task) => task.id === taskId)
      if (!latestTask || latestTask.status !== 'running') return

      useStore.getState().setTaskStreamPreview(taskId)
      updateTaskInStore(taskId, {
        status: 'error',
        error,
        rawResponsePayload,
        falRecoverable: false,
        customRecoverable: false,
        finishedAt: Date.now(),
        elapsed: Date.now() - latestTask.createdAt,
      })
    }

    const pauseAgentImageTaskForRecovery = (toolCallId: string, err: unknown) => {
      const taskId = taskIdByToolCallId.get(toolCallId)
      if (!taskId || !isNetworkRecoverableError(err)) return false
      const latestTask = useStore.getState().tasks.find((task) => task.id === taskId)
      if (!latestTask || latestTask.status !== 'running') return false

      if (latestTask.apiProvider === 'fal' && latestTask.falRequestId && latestTask.falEndpoint) {
        useStore.getState().setTaskStreamPreview(taskId)
        updateTaskInStore(taskId, {
          status: 'error',
          error: '与 fal.ai 的连接已断开，之后会继续查询任务结果。',
          falRecoverable: true,
          finishedAt: Date.now(),
          elapsed: Date.now() - latestTask.createdAt,
        })
        scheduleFalRecovery(taskId, continueRecoveredAgentRound)
        return true
      }

      if (latestTask.customTaskId) {
        useStore.getState().setTaskStreamPreview(taskId)
        updateTaskInStore(taskId, {
          status: 'error',
          error: '与自定义异步任务的连接已断开，之后会继续查询任务结果。',
          customRecoverable: true,
          finishedAt: Date.now(),
          elapsed: Date.now() - latestTask.createdAt,
        })
        scheduleCustomRecovery(taskId, continueRecoveredAgentRound)
        return true
      }

      return false
    }

    if (shouldStreamAssistantMessage) {
      updateAgentConversation(conversationId, (current) => ({
        ...current,
        updatedAt: Date.now(),
        rounds: current.rounds.map((item) =>
          item.id === roundId ? { ...item, assistantMessageId } : item,
        ),
        messages: current.messages.some((message) => message.id === assistantMessageId)
          ? current.messages.map((message) => message.id === assistantMessageId
            ? resume
              ? { ...message, outputTaskIds: [...new Set([...(message.outputTaskIds ?? []), ...round.outputTaskIds])] }
              : { ...message, content: '', outputTaskIds: [] }
            : message)
          : [
              ...current.messages,
              {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                roundId,
                createdAt: Date.now(),
              },
            ],
      }))
    }
    const maxToolCalls = Number.isFinite(requestSettings.agentMaxToolRounds)
      ? Math.max(1, Math.trunc(requestSettings.agentMaxToolRounds))
      : DEFAULT_AGENT_MAX_TOOL_ROUNDS
    let accumulatedOutputItems: ResponsesOutputItem[] = resume?.responseOutput ?? []
    let accumulatedText = resumedAssistantContent
    const textSegments: string[] = resumedAssistantContent ? [resumedAssistantContent] : []
    let lastResponseId: string | undefined = round.responseId
    let toolCallsUsed = resume?.toolCallsUsed ?? 0
    let apiInputForTurn = apiInput
    if (resume) {
      apiInputForTurn = buildAgentContinuationInput(apiInput, round, useStore.getState().tasks, accumulatedOutputItems, toolCallsUsed, maxToolCalls)
      const batchImagesItem = await createAgentBatchImagesInputItem(round, useStore.getState().tasks, resume.recoveredTaskIds)
      if (batchImagesItem) apiInputForTurn.splice(apiInputForTurn.length - 1, 0, batchImagesItem)
    }
    let reachedToolLimit = resume ? toolCallsUsed >= maxToolCalls : false
    let pendingToolTextSeparator = false

    // Helper: resolve reference image ids to data URLs for batch image calls
    const resolveReferenceImages = async (referenceIds: string[]): Promise<{ dataUrls: string[]; imageIds: string[] }> => {
      const dataUrls: string[] = []
      const imageIds: string[] = []
      for (const refId of referenceIds) {
        // Resolve both generated image refs and current/user input refs from XML tags.
        const latestConv = useStore.getState().agentConversations.find((item) => item.id === conversationId)
        if (!latestConv) continue
        for (const r of getAgentRoundPath(latestConv, roundId)) {
          for (let imgIdx = 0; imgIdx < r.inputImageIds.length; imgIdx++) {
            const currentRefId = getAgentCurrentReferenceId(r, imgIdx)
            if (currentRefId === refId) {
              const imageId = r.inputImageIds[imgIdx]
              const dataUrl = await ensureImageCached(imageId)
              if (dataUrl) dataUrls.push(dataUrl)
              imageIds.push(imageId)
            }
          }
          const outputImages = collectAgentRoundOutputImageSlots(r, useStore.getState().tasks)
          for (let imgIdx = 0; imgIdx < outputImages.length; imgIdx++) {
            const generatedRefId = getAgentGeneratedImageReferenceId(r, imgIdx)
            if (generatedRefId === refId) {
              const imageId = outputImages[imgIdx]
              if (!imageId) continue
              const dataUrl = await ensureImageCached(imageId)
              if (dataUrl) dataUrls.push(dataUrl)
              imageIds.push(imageId)
            }
          }
        }
      }
      return { dataUrls, imageIds }
    }

    const parseSingleImageCallArguments = (args: string): { id: string; prompt: string } | null => {
      try {
        const parsed = JSON.parse(args) as Record<string, unknown>
        const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
        if (!prompt) return null
        const id = typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : 'image'
        return { id, prompt }
      } catch {
        return null
      }
    }

    const callHybridImageApiSingle = async (opts: {
      taskId: string
      prompt: string
      referenceImageDataUrls: string[]
      taskParams: TaskParams
      signal: AbortSignal
      onPartialImage?: (event: { image: string; partialImageIndex?: number }) => void | Promise<void>
    }) => {
      const result = await callImageApi({
        settings: imageRequestSettings,
        prompt: replaceImageMentionsForApi(opts.prompt, opts.referenceImageDataUrls.length),
        params: opts.taskParams,
        inputImageDataUrls: opts.referenceImageDataUrls,
        signal: opts.signal,
        onPartialImage: opts.onPartialImage
          ? (partial) => {
              void opts.onPartialImage?.({ image: partial.image, partialImageIndex: partial.partialImageIndex ?? partial.requestIndex })
            }
          : undefined,
        onFalRequestEnqueued: (request) => {
          updateTaskInStore(opts.taskId, {
            falRequestId: request.requestId,
            falEndpoint: request.endpoint,
            falRecoverable: false,
          })
        },
        onCustomTaskEnqueued: (request) => {
          updateTaskInStore(opts.taskId, {
            customTaskId: request.taskId,
            customRecoverable: false,
          })
        },
      })
      if (opts.signal.aborted) throw createAgentAbortError()
      const dataUrl = result.images[0]
      return {
        image: dataUrl ? {
          dataUrl,
          actualParams: result.actualParamsList?.[0] ?? result.actualParams,
          revisedPrompt: result.revisedPrompts?.[0] ?? opts.prompt,
        } satisfies AgentApiResultImage : null,
        error: result.failedRequests?.[0]?.error ?? (dataUrl ? null : '接口未返回图片数据'),
        rawResponsePayload: JSON.stringify({
          imageCount: result.images.length,
          actualParams: result.actualParams,
          actualParamsList: result.actualParamsList,
          revisedPrompts: result.revisedPrompts,
          rawImageUrls: result.rawImageUrls,
          failedRequests: result.failedRequests,
        }, null, 2),
      }
    }

    const executeSingleImageFunctionCall = async (functionCallItem: ResponsesOutputItem): Promise<string> => {
      const callId = functionCallItem.call_id ?? ''
      const item = parseSingleImageCallArguments(functionCallItem.arguments ?? '')
      if (!item) return JSON.stringify({ error: 'Invalid or empty image arguments' })

      const referenceIds = uniqueIds(extractAgentReferenceIds(item.prompt))
      const references = await resolveReferenceImages(referenceIds)
      const toolCallId = callId || genId()
      const taskParams = {
        ...normalizeParamsForSettings(params, imageRequestSettings, { hasInputImages: references.dataUrls.length > 0 }),
        n: 1,
      }

      const taskId = await ensureStreamingAgentTask(toolCallId, item.prompt, references.imageIds, {
        createdAt: Date.now(),
        taskParams,
        maskTargetImageId: null,
        maskImageId: null,
      })

      try {
        const result = await callHybridImageApiSingle({
          taskId,
          prompt: item.prompt,
          referenceImageDataUrls: references.dataUrls,
          taskParams,
          signal: controller.signal,
          onPartialImage: async ({ image, partialImageIndex }) => {
            if (controller.signal.aborted) return
            const taskId = taskIdByToolCallId.get(toolCallId)
            if (taskId) {
              useStore.getState().setTaskStreamPreview(taskId, image, partialImageIndex)
              if (partialImageIndex === 0 || partialImageIndex == null) void persistTaskStreamPartialImage(taskId, image)
            }
          },
        })

        if (controller.signal.aborted) throw createAgentAbortError()
        if (result.image) {
          await completeAgentImageTask({ ...result.image, toolCallId }, result.rawResponsePayload)
          toolCallsUsed += 1
          return JSON.stringify({ id: item.id, status: 'done' })
        }

        failAgentImageTask(toolCallId, result.error!, result.rawResponsePayload)
        return JSON.stringify({ id: item.id, status: 'error', error: result.error })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        if (controller.signal.aborted) throw createAgentAbortError()
        if (pauseAgentImageTaskForRecovery(toolCallId, err)) throw createAgentRecoveryPauseError()
        failAgentImageTask(toolCallId, error)
        return JSON.stringify({ id: item.id, status: 'error', error })
      }
    }

    // Helper: execute a generate_image_batch function call concurrently
    const executeBatchFunctionCall = async (functionCallItem: ResponsesOutputItem): Promise<string> => {
      const callId = functionCallItem.call_id ?? ''
      const args = functionCallItem.arguments ?? ''
      const batchItems = parseBatchImageCallArguments(args)

      if (!batchItems || batchItems.length === 0) {
        return JSON.stringify({ error: 'Invalid or empty batch arguments' })
      }

      // Create task cards in model-provided order before starting network calls.
      const batchExecutionItems = []
      for (const item of batchItems) {
        const referenceIds = uniqueIds(extractAgentReferenceIds(item.prompt))
        const references = await resolveReferenceImages(referenceIds)
        const batchToolCallId = genId()
        const taskParams = requestSettings.agentApiConfigMode === 'hybrid'
          ? {
              ...normalizeParamsForSettings(params, imageRequestSettings, { hasInputImages: references.dataUrls.length > 0 }),
              n: 1,
            }
          : { ...params, n: 1 }
        await ensureStreamingAgentTask(batchToolCallId, item.prompt, references.imageIds, {
          createdAt: Date.now(),
          taskParams,
          maskTargetImageId: null,
          maskImageId: null,
          ...(callId ? { agentBatchCallId: callId } : {}),
        })
        batchExecutionItems.push({ item, batchToolCallId, references, referenceIds, taskParams })
      }

      // Fire all batch items concurrently after all cards are visible.
      const batchPromises = batchExecutionItems.map(async ({ item, batchToolCallId, references, referenceIds, taskParams }) => {

        const batchResult = requestSettings.agentApiConfigMode === 'hybrid'
          ? {
              batchItemId: item.id,
              ...(await callHybridImageApiSingle({
                taskId: taskIdByToolCallId.get(batchToolCallId)!,
                prompt: item.prompt,
                referenceImageDataUrls: references.dataUrls,
                taskParams,
                signal: controller.signal,
                onPartialImage: async ({ image, partialImageIndex }) => {
                  if (controller.signal.aborted) return
                  const taskId = taskIdByToolCallId.get(batchToolCallId)
                  if (taskId) {
                    useStore.getState().setTaskStreamPreview(taskId, image, partialImageIndex)
                    if (partialImageIndex === 0 || partialImageIndex == null) void persistTaskStreamPartialImage(taskId, image)
                  }
                },
              })),
            }
          : await callBatchImageSingle({
              profile: imageProfile,
              params: taskParams,
              batchItemId: item.id,
              prompt: item.prompt,
              referenceImageDataUrls: references.dataUrls,
              referenceIds,
              allowPromptRewrite: requestSettings.allowPromptRewrite,
              signal: controller.signal,
              onImageToolStarted: shouldStreamAssistantMessage
                ? async () => {
                    if (controller.signal.aborted) return
                  }
                : undefined,
              onPartialImage: shouldStreamAssistantMessage
                ? async ({ image, partialImageIndex }) => {
                    if (controller.signal.aborted) return
                    const taskId = taskIdByToolCallId.get(batchToolCallId)
                    if (taskId) {
                      useStore.getState().setTaskStreamPreview(taskId, image, partialImageIndex)
                      if (partialImageIndex === 0 || partialImageIndex == null) {
                        void persistTaskStreamPartialImage(taskId, image)
                      }
                    }
                  }
                : undefined,
              onImageToolCompleted: shouldStreamAssistantMessage
                ? async (image) => {
                    if (controller.signal.aborted) return
                    await completeAgentImageTask({ ...image, toolCallId: batchToolCallId })
                  }
                : undefined,
            })

        if (controller.signal.aborted) throw createAgentAbortError()
        // If not streaming and we have an image, complete the pre-created task.
        if (batchResult.image && !shouldStreamAssistantMessage) {
          await completeAgentImageTask({ ...batchResult.image, toolCallId: batchToolCallId }, batchResult.rawResponsePayload)
        }

        return batchResult
      })

      const batchResults = await Promise.allSettled(batchPromises)
      if (controller.signal.aborted) throw createAgentAbortError()

      // Build function_call_output
      const outputImages: Array<{ id: string; status: string; error?: string }> = []
      let pausedForRecovery = false
      for (let i = 0; i < batchItems.length; i++) {
        const settled = batchResults[i]
        const batchItem = batchItems[i]
        if (settled.status === 'fulfilled') {
          const r = settled.value
          if (!r.image) {
            failAgentImageTask(batchExecutionItems[i].batchToolCallId, r.error!, r.rawResponsePayload)
          }
          outputImages.push({
            id: r.batchItemId,
            status: r.image ? 'done' : 'error',
            ...(r.error ? { error: r.error } : {}),
          })
        } else {
          const error = settled.reason instanceof Error ? settled.reason.message : String(settled.reason)
          if (isAgentRecoveryPauseError(settled.reason) || pauseAgentImageTaskForRecovery(batchExecutionItems[i].batchToolCallId, settled.reason)) {
            pausedForRecovery = true
            continue
          }
          failAgentImageTask(batchExecutionItems[i].batchToolCallId, error)
          outputImages.push({
            id: batchItem.id,
            status: 'error',
            error,
          })
        }
      }
      if (pausedForRecovery) throw createAgentRecoveryPauseError()

      const successCount = outputImages.filter((img) => img.status === 'done').length
      toolCallsUsed += successCount

      return JSON.stringify({ images: outputImages })
    }

    while (true) {
      if (controller.signal.aborted) throw createAgentAbortError()
      if (reachedToolLimit) break
      const textBeforeResponse = accumulatedText
      let currentResponseOutputItems: ResponsesOutputItem[] = []
      const result = await callAgentResponsesApi({
        settings: requestSettings,
        profile: activeProfile,
        params,
        input: apiInputForTurn,
        skillInstructions: skillInstructions ?? undefined,
        maskDataUrl,
        signal: controller.signal,
        onTextDelta: shouldStreamAssistantMessage
          ? (delta) => {
              if (controller.signal.aborted) return
              if (pendingToolTextSeparator && delta && accumulatedText.trim()) {
                accumulatedText += '\n\n'
                appendAgentAssistantMessageContent(conversationId, assistantMessageId, '\n\n')
              }
              pendingToolTextSeparator = false
              accumulatedText += delta
              appendAgentAssistantMessageContent(conversationId, assistantMessageId, delta)
            }
          : undefined,
        onOutputItems: shouldStreamAssistantMessage
          ? (outputItems) => {
              if (controller.signal.aborted) return
              currentResponseOutputItems = outputItems
              updateAgentConversation(conversationId, (current) => ({
                ...current,
                rounds: current.rounds.map((item) => item.id === roundId ? { ...item, responseOutput: mergeResponseOutputItems(accumulatedOutputItems, outputItems) } : item),
              }))
            }
          : undefined,
        onImageToolStarted: shouldStreamAssistantMessage
          ? async ({ toolCallId }) => {
              if (controller.signal.aborted) return
              await ensureStreamingAgentTask(toolCallId)
            }
          : undefined,
        onImagePartialImage: shouldStreamAssistantMessage
          ? async ({ toolCallId, image, partialImageIndex }) => {
              if (controller.signal.aborted) return
              const taskId = await ensureStreamingAgentTask(toolCallId)
              if (controller.signal.aborted) return
              useStore.getState().setTaskStreamPreview(taskId, image, partialImageIndex)
              if (partialImageIndex === 0 || partialImageIndex == null) {
                void persistTaskStreamPartialImage(taskId, image)
              }
            }
          : undefined,
        onImageToolCompleted: shouldStreamAssistantMessage
          ? async (image) => {
              if (controller.signal.aborted) return
              await completeAgentImageTask(image)
            }
          : undefined,
        onImageToolFailed: shouldStreamAssistantMessage
          ? async ({ toolCallId, error }) => {
              if (controller.signal.aborted) return
              await ensureStreamingAgentTask(toolCallId)
              if (controller.signal.aborted) return
              failAgentImageTask(toolCallId, error)
            }
          : undefined,
      })
      if (controller.signal.aborted) throw createAgentAbortError()

      lastResponseId = result.responseId ?? lastResponseId
      currentResponseOutputItems = currentResponseOutputItems.length ? currentResponseOutputItems : result.outputItems ?? []
      accumulatedOutputItems = mergeResponseOutputItems(accumulatedOutputItems, currentResponseOutputItems)
      updateAgentConversation(conversationId, (current) => ({
        ...current,
        updatedAt: Date.now(),
        rounds: current.rounds.map((item) => item.id === roundId ? { ...item, responseId: lastResponseId, responseOutput: accumulatedOutputItems } : item),
      }))

      const responseText = result.text.trim()
      if (responseText && accumulatedText === textBeforeResponse) {
        const textToAppend = accumulatedText ? `\n\n${responseText}` : responseText
        accumulatedText += textToAppend
        if (shouldStreamAssistantMessage) appendAgentAssistantMessageContent(conversationId, assistantMessageId, textToAppend)
      }
      const newTextInThisResponse = accumulatedText.slice(textBeforeResponse.length).trim()
      if (newTextInThisResponse) textSegments.push(newTextInThisResponse)

      // Process built-in image_generation_call results (single images)
      for (const image of result.images) {
        if (image.toolCallId && taskIdByToolCallId.has(image.toolCallId)) {
          const completedTaskId = await completeAgentImageTask(image, result.rawResponsePayload)
          const promptRefIds = uniqueIds(extractAgentReferenceIds(image.revisedPrompt ?? ''))
          if (promptRefIds.length > 0) {
            const promptRefs = await resolveReferenceImages(promptRefIds)
            if (promptRefs.imageIds.length > 0) {
              const latestTask = useStore.getState().tasks.find((t) => t.id === completedTaskId)
              if (latestTask) {
                const mergedInputIds = uniqueIds([...latestTask.inputImageIds, ...promptRefs.imageIds])
                if (mergedInputIds.length !== latestTask.inputImageIds.length) {
                  updateTaskInStore(completedTaskId, { inputImageIds: mergedInputIds })
                }
              }
            }
          }
          continue
        }
        const promptRefIds = uniqueIds(extractAgentReferenceIds(image.revisedPrompt ?? ''))
        const promptRefs = await resolveReferenceImages(promptRefIds)
        const stored = await storeImageWithSize(image.dataUrl, 'generated')
        cacheImage(stored.id, image.dataUrl)
        const actualParams: Partial<TaskParams> = {
          ...(Object.keys(image.actualParams ?? {}).length ? image.actualParams : {}),
          ...(!hasActualSizeParam(image.actualParams) ? getImageSizeParam(stored) ?? {} : {}),
          n: 1,
        }
        const task: TaskRecord = {
          id: genId(),
          prompt: image.revisedPrompt ?? round?.prompt ?? userMessage.content,
          params,
          apiProvider: imageProfile.provider,
          apiProfileId: imageProfile.id,
          apiProfileName: imageProfile.name,
          apiMode: imageProfile.apiMode,
          apiModel: imageProfile.model,
          inputImageIds: uniqueIds([...(round?.inputImageIds ?? []), ...promptRefs.imageIds]),
          maskTargetImageId: round?.maskTargetImageId ?? null,
          maskImageId: round?.maskImageId ?? null,
          outputImages: [stored.id],
          actualParams,
          actualParamsByImage: { [stored.id]: actualParams },
          revisedPromptByImage: image.revisedPrompt ? { [stored.id]: image.revisedPrompt } : undefined,
          rawResponsePayload: result.rawResponsePayload,
          status: 'done',
          error: null,
          createdAt: startedAt,
          finishedAt: Date.now(),
          elapsed: Date.now() - startedAt,
          sourceMode: 'agent',
          agentConversationId: conversationId,
          agentRoundId: roundId,
          agentMessageId: assistantMessageId,
          agentToolCallId: image.toolCallId,
          agentToolAction: image.action,
        }
        useStore.getState().setTasks([task, ...useStore.getState().tasks])
        attachTaskToAgentRound(task.id)
        await putTask(task)
      }

      if (result.rawResponsePayload && streamingTaskIds.length > 0) {
        for (const taskId of streamingTaskIds) {
          const latestTask = useStore.getState().tasks.find((task) => task.id === taskId)
          if (latestTask && !latestTask.rawResponsePayload) updateTaskInStore(taskId, { rawResponsePayload: result.rawResponsePayload })
        }
      }

      // Check for function calls that require continuation
      const imageFunctionCalls = currentResponseOutputItems.filter(
        (item) => item.type === 'function_call' && item.name === 'generate_image',
      )
      const batchFunctionCalls = currentResponseOutputItems.filter(
        (item) => item.type === 'function_call' && item.name === 'generate_image_batch',
      )
      const continueFunctionCalls = currentResponseOutputItems.filter(
        (item) => item.type === 'function_call' && item.name === 'continue_generation',
      )

      // Count built-in tool calls (image_generation, web_search) for budget tracking
      const responseToolCalls = countResponseToolCalls(currentResponseOutputItems)
      toolCallsUsed += responseToolCalls

      // Collect function_call_output items for all function calls that need responses
      const functionCallOutputs: ResponsesOutputItem[] = []

      if (imageFunctionCalls.length > 0) {
        for (const fc of imageFunctionCalls) {
          const output = await executeSingleImageFunctionCall(fc)
          functionCallOutputs.push({
            type: 'function_call_output',
            call_id: fc.call_id,
            output,
          })
        }
      }

      if (batchFunctionCalls.length > 0) {
        for (const fc of batchFunctionCalls) {
          const output = await executeBatchFunctionCall(fc)
          functionCallOutputs.push({
            type: 'function_call_output',
            call_id: fc.call_id,
            output,
          })
        }
      }

      for (const fc of continueFunctionCalls) {
        functionCallOutputs.push({
          type: 'function_call_output',
          call_id: fc.call_id,
          output: JSON.stringify({ status: 'continued' }),
        })
      }

      // If no function calls need output → model decided the task is done → break
      if (functionCallOutputs.length === 0) {
        updateAgentConversation(conversationId, (current) => ({
          ...current,
          updatedAt: Date.now(),
          rounds: current.rounds.map((item) => item.id === roundId ? { ...item, responseId: lastResponseId, responseOutput: accumulatedOutputItems } : item),
        }))
        break
      }

      const accumulatedOutputItemsWithFunctionOutputs = mergeResponseOutputItems(accumulatedOutputItems, functionCallOutputs)

      updateAgentConversation(conversationId, (current) => ({
        ...current,
        updatedAt: Date.now(),
        rounds: current.rounds.map((item) => item.id === roundId ? { ...item, responseId: lastResponseId, responseOutput: accumulatedOutputItemsWithFunctionOutputs } : item),
      }))

      if (toolCallsUsed >= maxToolCalls) {
        reachedToolLimit = true
        break
      }

      // Build continuation input with function call outputs and available refs
      const latestConversation = useStore.getState().agentConversations.find((item) => item.id === conversationId)
      const latestRound = latestConversation?.rounds.find((item) => item.id === roundId)
      if (!latestRound) break

      const continuationBase = buildAgentContinuationInput(
        apiInput,
        latestRound,
        useStore.getState().tasks,
        accumulatedOutputItems,
        toolCallsUsed,
        maxToolCalls,
      )
      // Insert function_call_output items before the continuation system message
      continuationBase.splice(continuationBase.length - 1, 0, ...functionCallOutputs)
      // Inject batch-generated images as input_image user message for model visibility
      const batchImagesItem = await createAgentBatchImagesInputItem(latestRound, useStore.getState().tasks, streamingTaskIds)
      if (batchImagesItem) continuationBase.splice(continuationBase.length - 1, 0, batchImagesItem)
      apiInputForTurn = continuationBase
      accumulatedOutputItems = accumulatedOutputItemsWithFunctionOutputs
      pendingToolTextSeparator = true
    }

    markAgentRoundTasksFailed(
      conversationId,
      roundId,
      requestSettings.agentApiConfigMode === 'hybrid' ? '自定义图像生成工具未返回图片' : '内置 image_generation 工具未返回图片',
      undefined,
      (task) => Boolean(task.agentToolCallId && !task.agentBatchCallId),
    )

    const taskIds: string[] = [...streamingTaskIds]
    const outputIds = taskIds.flatMap((taskId) => useStore.getState().tasks.find((task) => task.id === taskId)?.outputImages ?? [])
    const limitNotice = reachedToolLimit ? `已达到最大工具调用次数（${maxToolCalls}），已停止自动续跑。` : ''
    const joinedText = textSegments.join('\n\n').trim()
    const finalContent = [joinedText, limitNotice]
      .filter(Boolean)
      .join(joinedText ? '\n\n' : '')
      || (taskIds.length > 0 || outputIds.length > 0 ? '图像已生成。' : '')

    const assistantMessage: AgentMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: finalContent,
      roundId,
      outputTaskIds: taskIds,
      createdAt: Date.now(),
    }

    updateAgentConversation(conversationId, (current) => ({
      ...current,
      updatedAt: Date.now(),
      rounds: current.rounds.map((round) =>
        round.id === roundId
          ? {
              ...round,
              assistantMessageId,
              outputTaskIds: taskIds,
              responseId: lastResponseId,
              responseOutput: accumulatedOutputItems,
              status: 'done',
              error: null,
              finishedAt: Date.now(),
            }
          : round,
      ),
      messages: current.messages.some((message) => message.id === assistantMessageId)
        ? current.messages.map((message) => message.id === assistantMessageId ? assistantMessage : message)
        : [...current.messages, assistantMessage],
    }))

    useStore.getState().showToast(outputIds.length > 0 ? 'Agent 已生成图片' : 'Agent 已回复', 'success')
    showTaskCompletionNotification(
      outputIds.length > 0 ? 'Agent 已生成图片' : 'Agent 已回复',
      outputIds.length > 0 ? `Agent 回复已结束，共生成 ${outputIds.length} 张图片。` : 'Agent 回复已结束。',
    )
  } catch (err) {
    if (controller.signal.aborted) {
      if (markAgentRoundStopped(conversationId, roundId)) {
        useStore.getState().showToast('已停止生成', 'info')
      }
      return
    }

    if (isAgentRecoveryPauseError(err)) return

    let message = err instanceof Error ? err.message : String(err)
    const usesApiProxy = activeProfile.apiProxy ?? requestSettings.apiProxy
    const networkErrorHint = getApiRequestNetworkErrorHint(err, startedAt, usesApiProxy, activeProfile)
    if (networkErrorHint && !message.includes(IMAGE_FETCH_CORS_HINT)) {
      message += `\n${networkErrorHint}`
    }

    markAgentRoundTasksFailed(conversationId, roundId, message, getRawErrorPayload(err).rawResponsePayload)

    updateAgentConversation(conversationId, (current) => {
      const failedRound = current.rounds.find((round) => round.id === roundId)
      const existingAssistantMessage = failedRound?.assistantMessageId
        ? current.messages.find((item) => item.id === failedRound.assistantMessageId)
        : current.messages.find((item) => item.roundId === roundId && item.role === 'assistant')
      const errorContent = `请求失败：${message}`

      return {
        ...current,
        title: current.rounds.length === 1 && current.rounds[0].id === roundId ? '新对话' : current.title,
        updatedAt: Date.now(),
        rounds: current.rounds.map((round) =>
          round.id === roundId
            ? {
                ...round,
                ...(existingAssistantMessage ? { assistantMessageId: existingAssistantMessage.id } : {}),
                status: 'error',
                error: message,
                finishedAt: Date.now(),
              }
            : round,
        ),
        messages: existingAssistantMessage
          ? current.messages.map((item) => item.id === existingAssistantMessage.id ? { ...item, content: errorContent } : item)
          : [
              ...current.messages,
              {
                id: genId(),
                role: 'assistant',
                content: errorContent,
                roundId,
                createdAt: Date.now(),
              },
            ],
      }
    })
    useStore.getState().showToast(`Agent 请求失败：${message}`, 'error')
  } finally {
    externalSignal?.removeEventListener('abort', abortFromCaller)
    if (agentRoundControllers.get(controllerKey) === controller) {
      agentRoundControllers.delete(controllerKey)
    }
  }
}
