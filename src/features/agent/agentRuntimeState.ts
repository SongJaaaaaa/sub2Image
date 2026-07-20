import type { AgentConversation, ApiProfile, AppSettings, TaskRecord } from '../../types'
import { callAgentConversationTitleApi } from '../../integrations/conversation/agentApi'
import { genId } from '../../lib/id'
import { useStore } from '../../state/appStore'
import { ensureImageCached } from '../imageLibrary'
import { clearCustomRecoveryTimer, clearFalRecoveryTimer, updateTaskInStore } from '../tasks'
import { getActiveAgentRounds } from './agentRounds'

const AGENT_RECOVERY_PAUSE_ERROR = 'AgentRecoveryPauseError'
export const AGENT_STOPPED_MESSAGE = '已停止生成。'
export const agentRoundControllers = new Map<string, AbortController>()

export function getActiveAgentConversation(): AgentConversation {
  const state = useStore.getState()
  const existing = state.agentConversations.find((conversation) => conversation.id === state.activeAgentConversationId)
  if (existing) return existing
  const id = state.createAgentConversation()
  return useStore.getState().agentConversations.find((conversation) => conversation.id === id)!
}

export function updateAgentConversation(conversationId: string, updater: (conversation: AgentConversation) => AgentConversation) {
  useStore.setState((state) => ({
    agentConversations: state.agentConversations.map((conversation) =>
      conversation.id === conversationId ? updater(conversation) : conversation,
    ),
  }))
}

export function getAgentRoundControllerKey(conversationId: string, roundId: string) {
  return `${conversationId}:${roundId}`
}

export function createAgentAbortError() {
  return new DOMException('Agent 请求已停止', 'AbortError')
}

export function createAgentRecoveryPauseError() {
  const err = new Error('Agent recovery paused')
  err.name = AGENT_RECOVERY_PAUSE_ERROR
  return err
}

export function isAgentRecoveryPauseError(err: unknown) {
  return err instanceof Error && err.name === AGENT_RECOVERY_PAUSE_ERROR
}

function appendAgentStoppedMessage(content: string) {
  const trimmed = content.trimEnd()
  if (!trimmed) return AGENT_STOPPED_MESSAGE
  if (trimmed.endsWith(AGENT_STOPPED_MESSAGE)) return trimmed
  return `${trimmed}\n\n${AGENT_STOPPED_MESSAGE}`
}

function markAgentRoundTasksStopped(conversationId: string, roundId: string, now = Date.now()) {
  const tasks = useStore.getState().tasks.filter((task) =>
    (task.status === 'running' || task.falRecoverable || task.customRecoverable) &&
    task.agentConversationId === conversationId &&
    task.agentRoundId === roundId,
  )

  for (const task of tasks) {
    clearFalRecoveryTimer(task.id)
    clearCustomRecoveryTimer(task.id)
    updateTaskInStore(task.id, {
      status: 'error',
      error: AGENT_STOPPED_MESSAGE,
      falRecoverable: false,
      customRecoverable: false,
      finishedAt: now,
      elapsed: Math.max(0, now - task.createdAt),
    })
  }
  return tasks.length > 0
}

export function markAgentRoundTasksFailed(
  conversationId: string,
  roundId: string,
  error: string,
  rawResponsePayload?: string,
  shouldFailTask: (task: TaskRecord) => boolean = () => true,
  now = Date.now(),
) {
  const tasks = useStore.getState().tasks.filter((task) =>
    task.status === 'running' &&
    task.agentConversationId === conversationId &&
    task.agentRoundId === roundId &&
    shouldFailTask(task),
  )

  for (const task of tasks) {
    useStore.getState().setTaskStreamPreview(task.id)
    updateTaskInStore(task.id, {
      status: 'error',
      error,
      ...(rawResponsePayload ? { rawResponsePayload } : {}),
      falRecoverable: false,
      customRecoverable: false,
      finishedAt: now,
      elapsed: Math.max(0, now - task.createdAt),
    })
  }
  return tasks.length > 0
}

export function markAgentRoundStopped(conversationId: string, roundId: string) {
  const now = Date.now()
  const stoppedTasks = markAgentRoundTasksStopped(conversationId, roundId, now)
  let stoppedRound = false
  updateAgentConversation(conversationId, (current) => {
    const round = current.rounds.find((item) => item.id === roundId)
    if (!round || round.status !== 'running') return current

    stoppedRound = true
    const existingAssistantMessage = current.messages.find((message) => message.roundId === roundId && message.role === 'assistant')
    const assistantMessageId = existingAssistantMessage?.id ?? genId()
    return {
      ...current,
      updatedAt: now,
      rounds: current.rounds.map((item) => item.id === roundId
        ? {
            ...item,
            ...(assistantMessageId ? { assistantMessageId } : {}),
            status: 'error',
            error: AGENT_STOPPED_MESSAGE,
            finishedAt: now,
          }
        : item,
      ),
      messages: existingAssistantMessage
        ? current.messages.map((message) => message.id === existingAssistantMessage.id
          ? { ...message, content: appendAgentStoppedMessage(message.content) }
          : message,
        )
        : [
            ...current.messages,
            { id: assistantMessageId, role: 'assistant', content: AGENT_STOPPED_MESSAGE, roundId, createdAt: now },
          ],
    }
  })
  return stoppedRound || stoppedTasks
}

export function appendAgentAssistantMessageContent(conversationId: string, messageId: string, delta: string) {
  if (!delta) return
  updateAgentConversation(conversationId, (current) => ({
    ...current,
    updatedAt: Date.now(),
    messages: current.messages.map((message) => message.id === messageId
      ? { ...message, content: `${message.content}${delta}` }
      : message,
    ),
  }))
}

export async function readAgentImageDataUrls(ids: string[]) {
  const dataUrls: string[] = []
  for (const id of ids) {
    const dataUrl = await ensureImageCached(id)
    if (dataUrl) dataUrls.push(dataUrl)
  }
  return dataUrls
}

export async function generateAgentConversationTitle(
  conversationId: string,
  prompt: string,
  inputImageIds: string[],
  requestSettings: AppSettings,
  activeProfile: ApiProfile,
  fallbackTitle: string,
  signal?: AbortSignal,
) {
  useStore.setState((state) => ({
    agentGeneratingTitleIds: { ...state.agentGeneratingTitleIds, [conversationId]: true },
  }))
  try {
    signal?.throwIfAborted()
    const imageDataUrls = await readAgentImageDataUrls(inputImageIds)
    signal?.throwIfAborted()
    const title = await callAgentConversationTitleApi({
      settings: requestSettings,
      profile: activeProfile,
      prompt,
      imageDataUrls,
      signal,
    })
    if (!title || title === fallbackTitle) return

    updateAgentConversation(conversationId, (current) => {
      const firstRound = current.rounds[0]
      if (!firstRound || firstRound.prompt !== prompt || current.title !== fallbackTitle) return current
      return { ...current, title, updatedAt: Date.now() }
    })
  } catch {
    // 标题生成失败不影响对话，保留本地标题。
  } finally {
    useStore.setState((state) => {
      const next = { ...state.agentGeneratingTitleIds }
      delete next[conversationId]
      return { agentGeneratingTitleIds: next }
    })
  }
}

export function stopAgentResponse(conversationId = useStore.getState().activeAgentConversationId) {
  if (!conversationId) return
  const conversation = useStore.getState().agentConversations.find((item) => item.id === conversationId)
  if (!conversation) return
  const activeRunningRound = [...getActiveAgentRounds(conversation)].reverse().find((round) => round.status === 'running')
  const runningRound = activeRunningRound ?? conversation.rounds.find((round) => round.status === 'running')
  if (!runningRound) return

  const controller = agentRoundControllers.get(getAgentRoundControllerKey(conversationId, runningRound.id))
  if (controller) {
    controller.abort()
    if (markAgentRoundStopped(conversationId, runningRound.id)) useStore.getState().showToast('已停止生成', 'info')
    return
  }

  markAgentRoundStopped(conversationId, runningRound.id)
  useStore.getState().showToast('已停止生成', 'info')
}
