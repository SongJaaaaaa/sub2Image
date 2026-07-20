import type {
  AgentMessage,
  AgentRound,
  ComposerDraft,
  TaskRecord,
} from '../../types'
import { DEFAULT_PARAMS } from '../../types'
import {
  getActiveApiProfile,
  getAgentImageApiProfile,
  getAgentTextApiProfile,
  normalizeSettings,
  validateApiProfile,
} from '../../lib/apiProfiles'
import { validateMaskMatchesImage } from '../../lib/canvasImage'
import { storeImage } from '../../lib/db'
import { genId } from '../../lib/id'
import { orderInputImagesForMask } from '../../lib/mask'
import { normalizeParamsForSettings } from '../../lib/paramCompatibility'
import { useStore } from '../../state/appStore'
import {
  clearInputDraftState,
  syncActiveInputDraft,
} from '../../state/inputDrafts'
import { composerDraftMatches, loadComposerDraft } from '../../integrations/conversation/composerDraft'
import {
  cacheImage,
  removeCachedImage,
} from '../imageLibrary'
import { executeTask as executeTaskRequest } from '../tasks/taskExecution'
import { putTask } from '../tasks/taskPersistence'
import { createSettingsForApiProfile } from '../tasks/taskProfiles'
import {
  clearCustomRecoveryTimer,
  clearFalRecoveryTimer,
  scheduleCustomRecovery,
  scheduleFalRecovery,
} from '../tasks/taskRecovery'
import { getAgentProfileValidationError } from './agentProfiles'
import { continueRecoveredAgentRound as continueRecoveredAgentRoundAction } from './agentRecovery'
import { getActiveAgentRounds, getAgentRoundPath, uniqueIds } from './agentRounds'
import { executeAgentRound } from './agentExecution'
import {
  generateAgentConversationTitle,
  getActiveAgentConversation,
  updateAgentConversation,
} from './agentRuntimeState'
import { createAgentConversationTitle } from './agentConversations'

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

export async function submitAgentMessage(options: { signal?: AbortSignal; draft?: ComposerDraft; conversationId?: string; editingRoundId?: string | null } = {}) {
  const state = useStore.getState()
  const { settings, showToast } = state
  const draft = options.draft ?? loadComposerDraft()
  const { prompt, inputImages, maskDraft } = draft
  const params = { ...state.params, ...draft.params }
  const normalizedSettings = normalizeSettings(settings)
  options.signal?.throwIfAborted()

  const agentValidationError = getAgentProfileValidationError(normalizedSettings)
  if (agentValidationError) {
    showToast(`请先完善 Agent API 配置：${agentValidationError.message}`, 'error')
    state.setShowSettings(true, normalizedSettings.agentApiConfigMode === 'off' ? 'sub2api' : 'agent')
    return
  }

  const activeProfile = getAgentTextApiProfile(normalizedSettings)!
  const imageProfile = getAgentImageApiProfile(normalizedSettings)!

  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) {
    showToast('请输入消息', 'error')
    return
  }

  const conversation = options.conversationId
    ? state.agentConversations.find((item) => item.id === options.conversationId)
    : getActiveAgentConversation()
  if (!conversation) {
    showToast('找不到要提交的 Agent 对话', 'error')
    return
  }
  if (conversation.rounds.some((round) => round.status === 'running')) {
    showToast('请等待生成完成，或先停止生成', 'info')
    return
  }

  let orderedInputImages = inputImages
  let maskImageId: string | null = null
  let maskTargetImageId: string | null = null

  if (maskDraft) {
    try {
      orderedInputImages = orderInputImagesForMask(inputImages, maskDraft.targetImageId)
      await validateMaskMatchesImage(maskDraft.maskDataUrl, orderedInputImages[0].dataUrl)
      options.signal?.throwIfAborted()
      maskImageId = await storeImage(maskDraft.maskDataUrl, 'mask')
      cacheImage(maskImageId, maskDraft.maskDataUrl)
      maskTargetImageId = maskDraft.targetImageId
    } catch (err) {
      if (options.signal?.aborted) throw err
      if (!inputImages.some((img) => img.id === maskDraft.targetImageId)) {
        state.clearMaskDraft()
      }
      showToast(err instanceof Error ? err.message : String(err), 'error')
      return
    }
  }

  const inputImageIds = uniqueIds(orderedInputImages.map((image) => image.id))

  for (const image of orderedInputImages) {
    await storeImage(image.dataUrl)
    options.signal?.throwIfAborted()
  }

  const requestSettings = createSettingsForApiProfile(normalizedSettings, activeProfile)
  const now = Date.now()
  const editingRoundId = options.editingRoundId !== undefined ? options.editingRoundId : state.agentEditingRoundId
  const editingRound = editingRoundId
    ? conversation.rounds.find((item) => item.id === editingRoundId) ?? null
    : null
  const editingRoundAssistantMessage = editingRound?.assistantMessageId
    ? conversation.messages.find((message) => message.id === editingRound.assistantMessageId) ?? null
    : conversation.messages.find((message) => message.roundId === editingRound?.id && message.role === 'assistant') ?? null
  const editingRoundHasAssistantMessage = Boolean(editingRoundAssistantMessage)
  const editingRoundHasErrorAssistantMessage = Boolean(
    editingRound?.status === 'error' && editingRoundAssistantMessage?.content.startsWith('请求失败：'),
  )
  const editingRoundHasChildren = editingRound
    ? conversation.rounds.some((round) => (round.parentRoundId ?? null) === editingRound.id)
    : false
  const shouldAppendToEditingRound = Boolean(
    editingRound && !editingRoundHasChildren && (!editingRoundHasAssistantMessage || editingRoundHasErrorAssistantMessage),
  )
  const roundId = shouldAppendToEditingRound && editingRound ? editingRound.id : genId()
  const userMessageId = shouldAppendToEditingRound && editingRound ? editingRound.userMessageId : genId()
  const activeRounds = getActiveAgentRounds(conversation)
  const activeLeafId = activeRounds[activeRounds.length - 1]?.id ?? null
  const parentRoundId = editingRound ? editingRound.parentRoundId ?? null : activeLeafId
  const parentPath = parentRoundId ? getAgentRoundPath(conversation, parentRoundId) : []
  const normalizedParams = {
    ...normalizeParamsForSettings(params, requestSettings, { hasInputImages: inputImageIds.length > 0 }),
    n: DEFAULT_PARAMS.n,
    transparent_output: false,
  }
  const round: AgentRound = {
    id: roundId,
    index: shouldAppendToEditingRound && editingRound ? editingRound.index : parentPath.length + 1,
    parentRoundId,
    ...(editingRoundHasErrorAssistantMessage && editingRoundAssistantMessage ? { assistantMessageId: editingRoundAssistantMessage.id } : {}),
    userMessageId,
    prompt: trimmedPrompt,
    inputImageIds,
    maskTargetImageId,
    maskImageId,
    outputTaskIds: [],
    status: 'running',
    error: null,
    createdAt: now,
    finishedAt: null,
  }
  const userMessage: AgentMessage = {
    id: userMessageId,
    role: 'user',
    content: trimmedPrompt,
    roundId,
    inputImageIds,
    maskTargetImageId,
    maskImageId,
    createdAt: now,
  }

  let fallbackTitle: string | null = null
  updateAgentConversation(conversation.id, (current) => {
    const nextTitle = current.rounds.length === 0 ? createAgentConversationTitle(trimmedPrompt, current.title) : current.title
    if (current.rounds.length === 0) fallbackTitle = nextTitle
    const messages = shouldAppendToEditingRound
      ? current.messages.some((message) => message.id === userMessageId)
        ? current.messages.map((message) => {
            if (message.id === userMessageId) return userMessage
            if (editingRoundHasErrorAssistantMessage && message.id === editingRoundAssistantMessage?.id) {
              return { ...message, content: '', outputTaskIds: [] }
            }
            return message
          })
        : [...current.messages, userMessage]
      : [...current.messages, userMessage]

    return {
      ...current,
      title: nextTitle,
      activeRoundId: roundId,
      updatedAt: now,
      rounds: shouldAppendToEditingRound
        ? current.rounds.map((item) => item.id === roundId ? round : item)
        : [...current.rounds, round],
      messages,
    }
  })

  useStore.setState((state) => {
    const active = state.appMode === 'agent' && state.activeAgentConversationId === conversation.id
    if (active) {
      if (!composerDraftMatches(state, draft)) return state
      for (const img of state.inputImages) removeCachedImage(img.id)
      return {
        ...syncActiveInputDraft(state, clearInputDraftState()),
        agentEditingRoundId: null,
      }
    }

    const saved = state.agentInputDrafts[conversation.id]
    if (!saved || !composerDraftMatches(saved, draft)) return state
    const agentInputDrafts = { ...state.agentInputDrafts }
    delete agentInputDrafts[conversation.id]
    return { agentInputDrafts }
  })

  if (fallbackTitle) {
    void generateAgentConversationTitle(conversation.id, trimmedPrompt, inputImageIds, requestSettings, activeProfile, fallbackTitle, options.signal)
  }

  await executeAgentRound(conversation.id, roundId, normalizedParams, requestSettings, activeProfile, imageProfile, undefined, options.signal)
}

/**
 * 工作台"直接生成"：不经过 Agent 文本模型分析，直接用当前图片 API 配置生成图片，
 * 并把结果作为一轮对话（round + 任务卡）挂到 Agent 对话流中。
 */
export async function submitAgentDirectImage(options: { signal?: AbortSignal; draft?: ComposerDraft; conversationId?: string } = {}) {
  const state = useStore.getState()
  const { showToast } = state
  const draft = options.draft ?? loadComposerDraft()
  const { prompt, inputImages, maskDraft } = draft
  const params = { ...state.params, ...draft.params }
  const normalizedSettings = normalizeSettings(state.settings)
  options.signal?.throwIfAborted()

  const profile = getActiveApiProfile(normalizedSettings)
  const profileError = validateApiProfile(profile)
  if (profileError) {
    showToast(`请求 API 配置不完整：${profileError}`, 'error')
    state.setShowSettings(true)
    return
  }

  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) {
    showToast('请输入提示词', 'error')
    return
  }

  const conversation = options.conversationId
    ? state.agentConversations.find((item) => item.id === options.conversationId)
    : getActiveAgentConversation()
  if (!conversation) {
    showToast('找不到要提交的 Agent 对话', 'error')
    return
  }
  if (conversation.rounds.some((round) => round.status === 'running')) {
    showToast('请等待生成完成，或先停止生成', 'info')
    return
  }

  let orderedInputImages = inputImages
  let maskImageId: string | null = null
  let maskTargetImageId: string | null = null
  if (maskDraft) {
    try {
      orderedInputImages = orderInputImagesForMask(inputImages, maskDraft.targetImageId)
      await validateMaskMatchesImage(maskDraft.maskDataUrl, orderedInputImages[0].dataUrl)
      options.signal?.throwIfAborted()
      maskImageId = await storeImage(maskDraft.maskDataUrl, 'mask')
      cacheImage(maskImageId, maskDraft.maskDataUrl)
      maskTargetImageId = maskDraft.targetImageId
    } catch (err) {
      if (options.signal?.aborted) throw err
      if (!inputImages.some((img) => img.id === maskDraft.targetImageId)) state.clearMaskDraft()
      showToast(err instanceof Error ? err.message : String(err), 'error')
      return
    }
  }

  const inputImageIds = uniqueIds(orderedInputImages.map((image) => image.id))
  for (const image of orderedInputImages) {
    await storeImage(image.dataUrl)
    options.signal?.throwIfAborted()
  }

  const requestSettings = createSettingsForApiProfile(normalizedSettings, profile)
  const normalizedParams = normalizeParamsForSettings(params, requestSettings, { hasInputImages: inputImageIds.length > 0 })
  const now = Date.now()
  const roundId = genId()
  const userMessageId = genId()
  const assistantMessageId = genId()
  const activeRounds = getActiveAgentRounds(conversation)
  const parentRoundId = activeRounds[activeRounds.length - 1]?.id ?? null
  const parentPath = parentRoundId ? getAgentRoundPath(conversation, parentRoundId) : []

  const task: TaskRecord = {
    id: genId(),
    prompt: trimmedPrompt,
    params: normalizedParams,
    apiProvider: profile.provider,
    apiProfileId: profile.id,
    apiProfileName: profile.name,
    apiMode: profile.apiMode,
    apiModel: profile.model,
    inputImageIds,
    maskTargetImageId,
    maskImageId,
    outputImages: [],
    status: 'running',
    error: null,
    createdAt: now,
    finishedAt: null,
    elapsed: null,
    sourceMode: 'agent',
    agentConversationId: conversation.id,
    agentRoundId: roundId,
    agentMessageId: assistantMessageId,
  }

  const round: AgentRound = {
    id: roundId,
    index: parentPath.length + 1,
    parentRoundId,
    userMessageId,
    assistantMessageId,
    prompt: trimmedPrompt,
    inputImageIds,
    maskTargetImageId,
    maskImageId,
    outputTaskIds: [task.id],
    status: 'running',
    error: null,
    createdAt: now,
    finishedAt: null,
  }
  const userMessage: AgentMessage = {
    id: userMessageId,
    role: 'user',
    content: trimmedPrompt,
    roundId,
    inputImageIds,
    maskTargetImageId,
    maskImageId,
    createdAt: now,
  }
  const assistantMessage: AgentMessage = {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    roundId,
    outputTaskIds: [task.id],
    createdAt: now,
  }

  updateAgentConversation(conversation.id, (current) => ({
    ...current,
    title: current.rounds.length === 0 ? createAgentConversationTitle(trimmedPrompt, current.title) : current.title,
    activeRoundId: roundId,
    updatedAt: now,
    rounds: [...current.rounds, round],
    messages: [...current.messages, userMessage, assistantMessage],
  }))

  useStore.setState((current) => {
    const active = current.appMode === 'agent' && current.activeAgentConversationId === conversation.id
    if (active) {
      if (!composerDraftMatches(current, draft)) return current
      for (const img of current.inputImages) removeCachedImage(img.id)
      return {
        ...syncActiveInputDraft(current, clearInputDraftState()),
        agentEditingRoundId: null,
      }
    }
    const saved = current.agentInputDrafts[conversation.id]
    if (!saved || !composerDraftMatches(saved, draft)) return current
    const agentInputDrafts = { ...current.agentInputDrafts }
    delete agentInputDrafts[conversation.id]
    return { agentInputDrafts }
  })

  useStore.getState().setTasks([task, ...useStore.getState().tasks])
  await putTask(task)

  try {
    await executeTask(task.id, options.signal)
  } finally {
    const finished = useStore.getState().tasks.find((item) => item.id === task.id)
    const finishedAt = Date.now()
    updateAgentConversation(conversation.id, (current) => ({
      ...current,
      updatedAt: finishedAt,
      rounds: current.rounds.map((item) =>
        item.id === roundId
          ? {
              ...item,
              status: finished?.status === 'error' ? 'error' : 'done',
              error: finished?.status === 'error' ? finished.error ?? null : null,
              finishedAt,
            }
          : item,
      ),
    }))
  }
}

export async function regenerateAgentAssistantMessage(conversationId: string, roundId: string) {
  const state = useStore.getState()
  const { settings, params, showToast } = state
  const normalizedSettings = normalizeSettings(settings)

  const agentValidationError = getAgentProfileValidationError(normalizedSettings)
  if (agentValidationError) {
    showToast(`请先完善 Agent API 配置：${agentValidationError.message}`, 'error')
    state.setShowSettings(true, normalizedSettings.agentApiConfigMode === 'off' ? 'sub2api' : 'agent')
    return
  }

  const activeProfile = getAgentTextApiProfile(normalizedSettings)!
  const imageProfile = getAgentImageApiProfile(normalizedSettings)!

  const conversation = state.agentConversations.find((item) => item.id === conversationId)
  const sourceRound = conversation?.rounds.find((item) => item.id === roundId) ?? null
  const sourceUserMessage = sourceRound
    ? conversation?.messages.find((message) => message.id === sourceRound.userMessageId) ?? null
    : null
  if (!conversation || !sourceRound || !sourceUserMessage) {
    showToast('找不到要重新生成的 Agent 消息', 'error')
    return
  }

  if (conversation.rounds.some((round) => round.status === 'running')) {
    showToast('请等待生成完成，或先停止生成', 'info')
    return
  }

  const inputImageIds = uniqueIds(sourceRound.inputImageIds)
  const requestSettings = createSettingsForApiProfile(normalizedSettings, activeProfile)
  const normalizedParams = {
    ...normalizeParamsForSettings(params, requestSettings, { hasInputImages: inputImageIds.length > 0 }),
    n: DEFAULT_PARAMS.n,
    transparent_output: false,
  }
  const now = Date.now()
  if (sourceRound.status === 'error') {
    const assistantMessageId = sourceRound.assistantMessageId
      ?? conversation.messages.find((message) => message.roundId === sourceRound.id && message.role === 'assistant')?.id
    updateAgentConversation(conversationId, (current) => ({
      ...current,
      activeRoundId: sourceRound.id,
      updatedAt: now,
      rounds: current.rounds.map((round) =>
        round.id === sourceRound.id
          ? {
              ...round,
              outputTaskIds: [],
              responseId: undefined,
              responseOutput: undefined,
              status: 'running',
              error: null,
              finishedAt: null,
            }
          : round,
      ),
      messages: assistantMessageId
        ? current.messages.map((message) =>
            message.id === assistantMessageId ? { ...message, content: '', outputTaskIds: [] } : message,
          )
        : current.messages,
    }))
    state.setAgentEditingRoundId(null)
    void executeAgentRound(conversationId, sourceRound.id, normalizedParams, requestSettings, activeProfile, imageProfile)
    return
  }

  const newRoundId = genId()
  const newUserMessageId = genId()
  const newRound: AgentRound = {
    id: newRoundId,
    index: sourceRound.index,
    parentRoundId: sourceRound.parentRoundId ?? null,
    userMessageId: newUserMessageId,
    prompt: sourceRound.prompt || sourceUserMessage.content.trim(),
    inputImageIds,
    maskTargetImageId: sourceRound.maskTargetImageId ?? sourceUserMessage.maskTargetImageId ?? null,
    maskImageId: sourceRound.maskImageId ?? sourceUserMessage.maskImageId ?? null,
    outputTaskIds: [],
    status: 'running',
    error: null,
    createdAt: now,
    finishedAt: null,
  }
  const newUserMessage: AgentMessage = {
    id: newUserMessageId,
    role: 'user',
    content: sourceUserMessage.content,
    roundId: newRoundId,
    inputImageIds,
    maskTargetImageId: sourceRound.maskTargetImageId ?? sourceUserMessage.maskTargetImageId ?? null,
    maskImageId: sourceRound.maskImageId ?? sourceUserMessage.maskImageId ?? null,
    createdAt: now,
  }

  updateAgentConversation(conversationId, (current) => ({
    ...current,
    activeRoundId: newRoundId,
    updatedAt: now,
    rounds: [...current.rounds, newRound],
    messages: [...current.messages, newUserMessage],
  }))
  state.setAgentEditingRoundId(null)
  void executeAgentRound(conversationId, newRoundId, normalizedParams, requestSettings, activeProfile, imageProfile)
}
