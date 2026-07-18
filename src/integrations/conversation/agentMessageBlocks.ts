import type { ConversationMessage } from '../../features/conversationComposer'
import { collectWebSearchCalls, getAgentRoundOutputItems, getWebSearchStatusForCalls, type AgentWebSearchStatus } from '../../lib/agentWebSearch'
import type { AgentConversation, AgentMessage, AgentRound, ResponsesOutputItem, TaskRecord } from '../../types'

export const CHAT_TEXT_KIND = 'chat/text'
export const AGENT_WEB_SEARCH_KIND = 'agent/web-search'
export const AGENT_IMAGE_TASK_KIND = 'agent/image-task'

const AGENT_STOPPED_MESSAGE = '已停止生成。'

export type AgentRoundTaskSlot = {
  taskId: string
  task: TaskRecord | null
}

export type AgentTextBlockPayload = {
  type: 'agent-text'
  streaming: boolean
  separated: boolean
}

export type AgentWebSearchBlockPayload = {
  type: 'agent-web-search'
  status: AgentWebSearchStatus
  variant: 'search' | 'batch'
  separated: boolean
}

export type AgentImageTaskBlockPayload = {
  type: 'agent-image-task'
  taskId: string
  task: TaskRecord | null
}

export type AgentConversationMessagePayload = {
  type: 'agent-message'
  message: AgentMessage
  round: AgentRound | null
  blocks: ConversationMessage[]
  error: boolean
  streaming: boolean
}

function isAgentRoundInterrupted(round: AgentRound | null) {
  return round?.status === 'error' && round.error === AGENT_STOPPED_MESSAGE
}

function markToolStatusStopped(status: AgentWebSearchStatus): AgentWebSearchStatus {
  if (status.completed) return status
  return { text: status.text.replace(/^正在/, '已停止'), completed: true }
}

function getImageTaskForOutputItem(item: ResponsesOutputItem, tasks: TaskRecord[]) {
  if (item.type === 'image_generation_call') {
    return tasks.find((task) => task.agentToolCallId && task.agentToolCallId === item.id) ?? null
  }
  if (item.type === 'function_call' && item.name === 'generate_image' && item.call_id) {
    return tasks.find((task) => task.agentToolCallId === item.call_id) ?? null
  }
  return null
}

function getBatchImageTasksForOutputItem(item: ResponsesOutputItem, tasks: TaskRecord[]) {
  if (item.type !== 'function_call' || item.name !== 'generate_image_batch' || !item.call_id) return []
  return tasks.filter((task) => task.agentBatchCallId === item.call_id)
}

function getTextFromOutputItem(item: ResponsesOutputItem) {
  if (item.type !== 'message') return ''
  return (item.content ?? [])
    .map((part) => typeof part.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim()
}

export function getAgentAssistantBlocks(round: AgentRound | null, taskSlots: AgentRoundTaskSlot[], allTasks: TaskRecord[], fallbackContent: string): ConversationMessage[] {
  const outputItems = getAgentRoundOutputItems(round, allTasks)
  const tasks = taskSlots.map((slot) => slot.task).filter(Boolean) as TaskRecord[]
  const interrupted = isAgentRoundInterrupted(round)
  const createdAt = round?.createdAt ?? 0
  if (outputItems.length === 0) {
    const blocks: ConversationMessage[] = []
    if (fallbackContent.trim()) {
      blocks.push({
        id: 'text:fallback',
        role: 'assistant',
        kind: CHAT_TEXT_KIND,
        content: fallbackContent,
        payload: {
          type: 'agent-text',
          streaming: round?.status === 'running',
          separated: false,
        } satisfies AgentTextBlockPayload,
        createdAt,
      })
    }
    for (const slot of taskSlots) {
      blocks.push({
        id: slot.task ? `image:${slot.task.id}` : `deleted-image:${slot.taskId}`,
        role: 'assistant',
        kind: AGENT_IMAGE_TASK_KIND,
        content: '',
        payload: {
          type: 'agent-image-task',
          taskId: slot.taskId,
          task: slot.task,
        } satisfies AgentImageTaskBlockPayload,
        createdAt: slot.task?.createdAt ?? createdAt,
      })
    }
    return blocks
  }

  const blocks: ConversationMessage[] = []
  const renderedTaskIds = new Set<string>()
  let renderedTextBlocks = 0
  let webSearchGroup: ResponsesOutputItem[] = []

  const flushWebSearchGroup = () => {
    if (webSearchGroup.length === 0) return
    const status = getWebSearchStatusForCalls(collectWebSearchCalls(webSearchGroup))
    if (status) {
      const nextStatus = interrupted ? markToolStatusStopped(status) : status
      blocks.push({
        id: `web-search:${blocks.length}:${webSearchGroup.map((item) => item.id).join(':')}`,
        role: 'assistant',
        kind: AGENT_WEB_SEARCH_KIND,
        content: nextStatus.text,
        payload: {
          type: 'agent-web-search',
          status: nextStatus,
          variant: 'search',
          separated: blocks.length > 0,
        } satisfies AgentWebSearchBlockPayload,
        createdAt,
      })
    }
    webSearchGroup = []
  }

  for (const item of outputItems) {
    if (item.type === 'web_search_call') {
      webSearchGroup.push(item)
      continue
    }

    flushWebSearchGroup()

    const imageTask = getImageTaskForOutputItem(item, tasks)
    if (imageTask && !renderedTaskIds.has(imageTask.id)) {
      renderedTaskIds.add(imageTask.id)
      blocks.push({
        id: `image:${imageTask.id}`,
        role: 'assistant',
        kind: AGENT_IMAGE_TASK_KIND,
        content: '',
        payload: {
          type: 'agent-image-task',
          taskId: imageTask.id,
          task: imageTask,
        } satisfies AgentImageTaskBlockPayload,
        createdAt: imageTask.createdAt,
      })
      continue
    }

    const batchTasks = getBatchImageTasksForOutputItem(item, tasks)
    if (batchTasks.length > 0) {
      for (const task of batchTasks) {
        if (renderedTaskIds.has(task.id)) continue
        renderedTaskIds.add(task.id)
        blocks.push({
          id: `image:${task.id}`,
          role: 'assistant',
          kind: AGENT_IMAGE_TASK_KIND,
          content: '',
          payload: {
            type: 'agent-image-task',
            taskId: task.id,
            task,
          } satisfies AgentImageTaskBlockPayload,
          createdAt: task.createdAt,
        })
      }
      continue
    }

    if ((round?.status === 'running' || interrupted) && item.type === 'function_call' && item.name === 'generate_image_batch') {
      const status = interrupted
        ? markToolStatusStopped({ text: '正在填写并发图像生成参数', completed: false })
        : { text: '正在填写并发图像生成参数', completed: false }
      blocks.push({
        id: `batch-params:${item.call_id ?? item.id ?? blocks.length}`,
        role: 'assistant',
        kind: AGENT_WEB_SEARCH_KIND,
        content: status.text,
        payload: {
          type: 'agent-web-search',
          status,
          variant: 'batch',
          separated: blocks.length > 0,
        } satisfies AgentWebSearchBlockPayload,
        createdAt,
      })
      continue
    }

    if (item.type === 'message') {
      const content = getTextFromOutputItem(item)
      if (content) {
        renderedTextBlocks += 1
        blocks.push({
          id: `text:${item.id ?? blocks.length}`,
          role: 'assistant',
          kind: CHAT_TEXT_KIND,
          content,
          payload: {
            type: 'agent-text',
            streaming: round?.status === 'running',
            separated: blocks.length > 0,
          } satisfies AgentTextBlockPayload,
          createdAt,
        })
      }
    }
  }

  flushWebSearchGroup()

  if (fallbackContent.trim() && renderedTextBlocks === 0) {
    blocks.push({
      id: 'text:fallback',
      role: 'assistant',
      kind: CHAT_TEXT_KIND,
      content: fallbackContent,
      payload: {
        type: 'agent-text',
        streaming: round?.status === 'running',
        separated: blocks.length > 0,
      } satisfies AgentTextBlockPayload,
      createdAt,
    })
  }
  for (const slot of taskSlots) {
    if (slot.task) {
      if (renderedTaskIds.has(slot.task.id)) continue
    }
    blocks.push({
      id: slot.task ? `image:${slot.task.id}` : `deleted-image:${slot.taskId}`,
      role: 'assistant',
      kind: AGENT_IMAGE_TASK_KIND,
      content: '',
      payload: {
        type: 'agent-image-task',
        taskId: slot.taskId,
        task: slot.task,
      } satisfies AgentImageTaskBlockPayload,
      createdAt: slot.task?.createdAt ?? createdAt,
    })
  }
  return blocks
}

export function getAgentConversationMessages(messages: AgentMessage[], conversation: AgentConversation, tasks: TaskRecord[]): ConversationMessage[] {
  return messages.map((message) => {
    const round = conversation.rounds.find((item) => item.id === message.roundId) ?? null
    const taskSlots = message.role === 'assistant' && round
      ? round.outputTaskIds.map((taskId) => ({
          taskId,
          task: tasks.find((task) => task.id === taskId) ?? null,
        }))
      : []
    const blocks = message.role === 'assistant'
      ? getAgentAssistantBlocks(round, taskSlots, tasks, message.content)
      : []

    return {
      id: message.id,
      role: message.role,
      kind: CHAT_TEXT_KIND,
      content: message.content,
      payload: {
        type: 'agent-message',
        message,
        round,
        blocks,
        error: Boolean(round?.status === 'error' && message.content.startsWith('请求失败：')),
        streaming: message.role === 'assistant' && round?.status === 'running',
      } satisfies AgentConversationMessagePayload,
      createdAt: message.createdAt,
    }
  })
}

export function getAgentAssistantCopyContent(fallbackContent: string, blocks: ConversationMessage[]) {
  if (!blocks.some((block) => block.kind !== CHAT_TEXT_KIND)) return fallbackContent

  const parts = blocks
    .filter((block) => block.kind === CHAT_TEXT_KIND)
    .map((block) => block.content.trim())
    .filter(Boolean)

  return parts.length > 0 ? parts.join('\n\n') : fallbackContent
}
