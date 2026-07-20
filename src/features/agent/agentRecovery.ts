import type { ApiProfile, AppSettings, AgentRound, ResponsesOutputItem, TaskParams, TaskRecord } from '../../types'
import { DEFAULT_AGENT_MAX_TOOL_ROUNDS } from '../../types'
import { parseBatchImageCallArguments } from '../../integrations/conversation/agentApi'
import { getAgentImageApiProfile, getAgentTextApiProfile, normalizeSettings } from '../../lib/apiProfiles'
import { isRecord } from '../../lib/object'
import { normalizeParamsForSettings } from '../../lib/paramCompatibility'
import { useStore } from '../../state/appStore'
import { createSettingsForApiProfile } from '../tasks/taskProfiles'
import { countResponseToolCalls } from './agentInput'
import { getAgentProfileValidationError } from './agentProfiles'
import {
  AGENT_STOPPED_MESSAGE,
  agentRoundControllers,
  getAgentRoundControllerKey,
  updateAgentConversation,
} from './agentRuntimeState'

const agentRecoveryContinuations = new Set<string>()

type ExecuteAgentRound = (
  conversationId: string,
  roundId: string,
  params: TaskParams,
  requestSettings: AppSettings,
  activeProfile: ApiProfile,
  imageProfile: ApiProfile,
  resume?: { responseOutput: ResponsesOutputItem[]; recoveredTaskIds: string[]; toolCallsUsed: number },
  externalSignal?: AbortSignal,
) => void | Promise<void>

function getAgentFunctionOutputCallIds(output: ResponsesOutputItem[]) {
  return new Set(output
    .filter((item) => item.type === 'function_call_output' && item.call_id)
    .map((item) => item.call_id!))
}

function createAgentRecoveredToolOutputs(round: AgentRound, tasks: TaskRecord[]) {
  const output = round.responseOutput ?? []
  if (output.length === 0) return null

  const existingOutputCallIds = getAgentFunctionOutputCallIds(output)
  const additions: ResponsesOutputItem[] = []
  const recoveredTaskIds: string[] = []
  let hasPendingRecoverableCall = false
  let allSuccessful = true

  for (const item of output) {
    if (item.type !== 'function_call' || !item.call_id || existingOutputCallIds.has(item.call_id)) continue

    if (item.name === 'generate_image') {
      const imageId = (() => {
        try {
          const value = JSON.parse(item.arguments ?? '{}') as Record<string, unknown>
          return typeof value.id === 'string' && value.id.trim() ? value.id.trim() : 'image'
        } catch {
          return 'image'
        }
      })()
      const task = tasks.find((itemTask) => itemTask.agentRoundId === round.id && itemTask.agentToolCallId === item.call_id)
      if (!task || task.status === 'running' || task.falRecoverable || task.customRecoverable) {
        hasPendingRecoverableCall = true
        continue
      }

      recoveredTaskIds.push(task.id)
      const ok = task.status === 'done' && task.outputImages.length > 0
      if (!ok) allSuccessful = false
      additions.push({
        type: 'function_call_output',
        call_id: item.call_id,
        output: JSON.stringify({
          id: imageId,
          status: ok ? 'done' : 'error',
          ...(ok ? {} : { error: task.error || '图像生成失败' }),
        }),
      })
      continue
    }

    if (item.name !== 'generate_image_batch') continue
    const batchItems = parseBatchImageCallArguments(item.arguments ?? '')
    if (!batchItems?.length) continue
    const batchTasks = round.outputTaskIds
      .map((taskId) => tasks.find((task) => task.id === taskId))
      .filter((task): task is TaskRecord => Boolean(task && task.agentBatchCallId === item.call_id))
    if (batchTasks.length < batchItems.length || batchTasks.some((task) => task.status === 'running' || task.falRecoverable || task.customRecoverable)) {
      hasPendingRecoverableCall = true
      continue
    }

    recoveredTaskIds.push(...batchTasks.map((task) => task.id))
    const images = batchItems.map((batchItem, idx) => {
      const task = batchTasks[idx]
      const ok = task?.status === 'done' && task.outputImages.length > 0
      if (!ok) allSuccessful = false
      return {
        id: batchItem.id,
        status: ok ? 'done' : 'error',
        ...(ok ? {} : { error: task?.error || '图像生成失败' }),
      }
    })
    additions.push({ type: 'function_call_output', call_id: item.call_id, output: JSON.stringify({ images }) })
  }

  if (hasPendingRecoverableCall || additions.length === 0) return null
  return { additions, recoveredTaskIds, allSuccessful }
}

function createReadyAgentRecoveredToolState(round: AgentRound, tasks: TaskRecord[]) {
  const recovered = createAgentRecoveredToolOutputs(round, tasks)
  if (recovered) return recovered
  if (!round.responseOutput?.length || round.outputTaskIds.length === 0) return null

  const outputCallIds = getAgentFunctionOutputCallIds(round.responseOutput)
  const pendingFunctionCall = round.responseOutput.some((item) =>
    item.type === 'function_call' &&
    (item.name === 'generate_image' || item.name === 'generate_image_batch') &&
    item.call_id &&
    !outputCallIds.has(item.call_id),
  )
  if (pendingFunctionCall) return null

  const roundTasks = round.outputTaskIds
    .map((taskId) => tasks.find((task) => task.id === taskId))
    .filter((task): task is TaskRecord => Boolean(task))
  if (roundTasks.length === 0 || roundTasks.some((task) => task.status === 'running' || task.falRecoverable || task.customRecoverable)) return null
  return {
    additions: [] as ResponsesOutputItem[],
    recoveredTaskIds: roundTasks.map((task) => task.id),
    allSuccessful: roundTasks.every((task) => task.status === 'done' && task.outputImages.length > 0),
  }
}

function appendAgentRecoveredToolOutputs(conversationId: string, roundId: string, additions: ResponsesOutputItem[]) {
  updateAgentConversation(conversationId, (current) => ({
    ...current,
    updatedAt: Date.now(),
    rounds: current.rounds.map((round) => {
      if (round.id !== roundId) return round
      const output = round.responseOutput ?? []
      const existingOutputCallIds = getAgentFunctionOutputCallIds(output)
      const nextAdditions = additions.filter((item) => item.call_id && !existingOutputCallIds.has(item.call_id))
      return nextAdditions.length > 0 ? { ...round, responseOutput: [...output, ...nextAdditions] } : round
    }),
  }))
}

function getAgentRecoveredToolCallCount(output: ResponsesOutputItem[], tasks: TaskRecord[]) {
  const functionOutputs = output.filter((item) => item.type === 'function_call_output')
  const functionCallCount = functionOutputs.reduce((count, item) => {
    if (!item.output) return count
    try {
      const payload = JSON.parse(item.output) as { images?: unknown[]; status?: string }
      if (Array.isArray(payload.images)) return count + payload.images.filter((image) => isRecord(image) && image.status === 'done').length
      return payload.status === 'done' ? count + 1 : count
    } catch {
      return count
    }
  }, 0)
  const builtInCount = countResponseToolCalls(output)
  const doneTaskCount = tasks.filter((task) => task.status === 'done').length
  return Math.max(functionCallCount + builtInCount, doneTaskCount)
}

function getAgentRecoveredFailureError(round: AgentRound, tasks: TaskRecord[]) {
  const failedTasks = round.outputTaskIds
    .map((taskId) => tasks.find((item) => item.id === taskId))
    .filter((task): task is TaskRecord => Boolean(task && task.status === 'error' && !task.falRecoverable && !task.customRecoverable))
  if (failedTasks.length === 0) return '图像生成失败'
  if (failedTasks.length === 1) return failedTasks[0].error || '图像生成失败'
  return '部分图像生成任务失败。'
}

export async function continueRecoveredAgentRound(taskId: string, executeAgentRound: ExecuteAgentRound) {
  const state = useStore.getState()
  const task = state.tasks.find((item) => item.id === taskId)
  if (!task?.agentConversationId || !task.agentRoundId) return

  const key = getAgentRoundControllerKey(task.agentConversationId, task.agentRoundId)
  if (agentRoundControllers.has(key) || agentRecoveryContinuations.has(key)) return
  agentRecoveryContinuations.add(key)
  try {
    const latestState = useStore.getState()
    const conversation = latestState.agentConversations.find((item) => item.id === task.agentConversationId)
    const round = conversation?.rounds.find((item) => item.id === task.agentRoundId)
    if (!conversation || !round || round.status === 'done' || round.error === AGENT_STOPPED_MESSAGE) return

    const failRound = (error: string) => {
      updateAgentConversation(conversation.id, (current) => ({
        ...current,
        updatedAt: Date.now(),
        rounds: current.rounds.map((currentRound) => currentRound.id === round.id
          ? { ...currentRound, status: 'error', error, finishedAt: Date.now() }
          : currentRound,
        ),
      }))
    }

    const recovered = createReadyAgentRecoveredToolState(round, latestState.tasks)
    if (!recovered) return
    appendAgentRecoveredToolOutputs(conversation.id, round.id, recovered.additions)
    const updatedState = useStore.getState()
    const updatedConversation = updatedState.agentConversations.find((item) => item.id === conversation.id)
    const updatedRound = updatedConversation?.rounds.find((item) => item.id === round.id)
    if (!updatedConversation || !updatedRound) return

    if (!recovered.allSuccessful) {
      failRound(getAgentRecoveredFailureError(updatedRound, updatedState.tasks))
      return
    }

    const normalizedSettings = normalizeSettings(updatedState.settings)
    const agentValidationError = getAgentProfileValidationError(normalizedSettings)
    if (agentValidationError) {
      failRound(`无法继续恢复任务：${agentValidationError.message}`)
      return
    }
    const activeProfile = getAgentTextApiProfile(normalizedSettings)
    const imageProfile = getAgentImageApiProfile(normalizedSettings)
    if (!activeProfile || !imageProfile) {
      failRound('Agent API 配置不存在，无法继续恢复任务。')
      return
    }
    const roundTasks = updatedState.tasks.filter((item) => item.agentRoundId === round.id)
    const resumeParams = roundTasks.find((item) => item.params)?.params
      ?? normalizeParamsForSettings(updatedState.params, createSettingsForApiProfile(normalizedSettings, activeProfile), { hasInputImages: round.inputImageIds.length > 0 })
    const maxToolCalls = Number.isFinite(normalizedSettings.agentMaxToolRounds)
      ? Math.max(1, Math.trunc(normalizedSettings.agentMaxToolRounds))
      : DEFAULT_AGENT_MAX_TOOL_ROUNDS
    const toolCallsUsed = getAgentRecoveredToolCallCount(updatedRound.responseOutput ?? [], roundTasks)

    updateAgentConversation(conversation.id, (current) => ({
      ...current,
      updatedAt: Date.now(),
      rounds: current.rounds.map((currentRound) => currentRound.id === round.id
        ? { ...currentRound, status: 'running', error: null, finishedAt: null }
        : currentRound,
      ),
    }))

    void executeAgentRound(
      conversation.id,
      round.id,
      resumeParams,
      createSettingsForApiProfile(normalizedSettings, activeProfile),
      activeProfile,
      imageProfile,
      {
        responseOutput: updatedRound.responseOutput ?? [],
        recoveredTaskIds: recovered.recoveredTaskIds,
        toolCallsUsed,
      },
    )
  } finally {
    agentRecoveryContinuations.delete(key)
  }
}
