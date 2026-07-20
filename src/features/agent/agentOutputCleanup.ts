import type { AgentConversation, AgentRound, ResponsesApiResponse, ResponsesOutputItem, TaskRecord } from '../../types'
import { useStore } from '../../state/appStore'
import { putTask } from '../tasks/taskPersistence'

function scrubResponseOutputForDeletedAgentTasks(round: AgentRound, output: ResponsesOutputItem[], deletedTasks: TaskRecord[]) {
  const deletedTaskIds = new Set(deletedTasks.map((task) => task.id))
  const deletedToolCallIds = new Set(
    deletedTasks.filter((task) => task.agentRoundId === round.id && task.agentToolCallId).map((task) => task.agentToolCallId!),
  )
  if (deletedTaskIds.size === 0) return output

  let anonymousImageIndex = 0
  return output.filter((item) => {
    if (item.type !== 'image_generation_call') return true
    if (typeof item.id === 'string' && item.id) return !deletedToolCallIds.has(item.id)
    const taskId = round.outputTaskIds[anonymousImageIndex]
    anonymousImageIndex += 1
    return !deletedTaskIds.has(taskId)
  })
}

function scrubAgentConversationsForDeletedTasks(conversations: AgentConversation[], deletedTasks: TaskRecord[]) {
  if (deletedTasks.length === 0) return conversations
  return conversations.map((conversation) => ({
    ...conversation,
    rounds: conversation.rounds.map((round) => {
      const roundDeletedTasks = deletedTasks.filter((task) => round.outputTaskIds.includes(task.id))
      if (roundDeletedTasks.length === 0 || !round.responseOutput?.length) return round
      return { ...round, responseOutput: scrubResponseOutputForDeletedAgentTasks(round, round.responseOutput, roundDeletedTasks) }
    }),
  }))
}

function scrubTaskRawResponsePayloadForDeletedTasks(task: TaskRecord, conversations: AgentConversation[], deletedTasks: TaskRecord[]) {
  if (!task.rawResponsePayload || !task.agentRoundId) return task
  const round = conversations.flatMap((conversation) => conversation.rounds).find((item) => item.id === task.agentRoundId)
  if (!round) return task
  const roundDeletedTasks = deletedTasks.filter((item) => round.outputTaskIds.includes(item.id))
  if (roundDeletedTasks.length === 0) return task

  try {
    const payload = JSON.parse(task.rawResponsePayload) as ResponsesApiResponse
    if (!Array.isArray(payload.output)) return task
    const output = scrubResponseOutputForDeletedAgentTasks(round, payload.output, roundDeletedTasks)
    if (output.length === payload.output.length) return task
    return { ...task, rawResponsePayload: JSON.stringify({ ...payload, output }, null, 2) }
  } catch {
    return task
  }
}

export async function scrubAgentOutputPayloadsForDeletedTasks(deletedTasks: TaskRecord[], remainingTasks: TaskRecord[]) {
  if (deletedTasks.length === 0) return remainingTasks
  const conversations = scrubAgentConversationsForDeletedTasks(useStore.getState().agentConversations, deletedTasks)
  const tasks = remainingTasks.map((task) => scrubTaskRawResponsePayloadForDeletedTasks(task, conversations, deletedTasks))
  useStore.setState({ agentConversations: conversations })
  for (const task of tasks) {
    const previous = remainingTasks.find((item) => item.id === task.id)
    if (previous?.rawResponsePayload !== task.rawResponsePayload) await putTask(task)
  }
  return tasks
}
