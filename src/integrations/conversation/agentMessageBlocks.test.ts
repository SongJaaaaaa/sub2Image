import { describe, expect, it } from 'vitest'
import type { AgentConversation, AgentMessage, AgentRound, TaskRecord } from '../../types'
import { DEFAULT_PARAMS } from '../../types'
import {
  AGENT_IMAGE_TASK_KIND,
  AGENT_WEB_SEARCH_KIND,
  CHAT_TEXT_KIND,
  getAgentAssistantBlocks,
  getAgentConversationMessages,
  type AgentConversationMessagePayload,
  type AgentImageTaskBlockPayload,
  type AgentWebSearchBlockPayload,
} from './agentMessageBlocks'

const round = (patch: Partial<AgentRound> = {}): AgentRound => ({
  id: patch.id ?? 'round-1',
  index: patch.index ?? 1,
  parentRoundId: patch.parentRoundId ?? null,
  userMessageId: patch.userMessageId ?? 'user-1',
  assistantMessageId: patch.assistantMessageId ?? 'assistant-1',
  prompt: patch.prompt ?? '测试',
  inputImageIds: patch.inputImageIds ?? [],
  outputTaskIds: patch.outputTaskIds ?? [],
  responseOutput: patch.responseOutput,
  status: patch.status ?? 'done',
  error: patch.error ?? null,
  createdAt: patch.createdAt ?? 1,
  finishedAt: patch.finishedAt ?? 2,
})

const task = (id: string, patch: Partial<TaskRecord> = {}): TaskRecord => ({
  id,
  prompt: patch.prompt ?? '测试',
  params: patch.params ?? { ...DEFAULT_PARAMS },
  inputImageIds: patch.inputImageIds ?? [],
  outputImages: patch.outputImages ?? [`${id}-image`],
  status: patch.status ?? 'done',
  error: patch.error ?? null,
  createdAt: patch.createdAt ?? 1,
  finishedAt: patch.finishedAt ?? 2,
  elapsed: patch.elapsed ?? 1,
  ...patch,
})

describe('agent message blocks', () => {
  it('maps fallback text, live tasks and removed task slots', () => {
    const live = task('task-live')
    const blocks = getAgentAssistantBlocks(
      round({ outputTaskIds: ['task-live', 'task-removed'] }),
      [
        { taskId: live.id, task: live },
        { taskId: 'task-removed', task: null },
      ],
      [live],
      '最终说明',
    )

    expect(blocks.map((block) => [block.kind, block.id, block.content])).toEqual([
      [CHAT_TEXT_KIND, 'text:fallback', '最终说明'],
      [AGENT_IMAGE_TASK_KIND, 'image:task-live', ''],
      [AGENT_IMAGE_TASK_KIND, 'deleted-image:task-removed', ''],
    ])
    expect((blocks[1].payload as AgentImageTaskBlockPayload).task).toBe(live)
    expect((blocks[2].payload as AgentImageTaskBlockPayload).task).toBeNull()
  })

  it('keeps search, text, single image and batch image output order without duplicates', () => {
    const builtIn = task('task-built-in', { agentToolCallId: 'image-call' })
    const func = task('task-function', { agentToolCallId: 'function-call' })
    const batchA = task('task-batch-a', { agentBatchCallId: 'batch-call' })
    const batchB = task('task-batch-b', { agentBatchCallId: 'batch-call' })
    const tasks = [builtIn, func, batchA, batchB]
    const currentRound = round({
      outputTaskIds: tasks.map((item) => item.id),
      responseOutput: [
        { id: 'search-1', type: 'web_search_call', status: 'in_progress', action: { type: 'search' } },
        { id: 'search-2', type: 'web_search_call', status: 'completed', action: { type: 'open_page' } },
        { id: 'text-1', type: 'message', content: [{ type: 'output_text', text: '搜索后的说明' }] },
        { id: 'image-call', type: 'image_generation_call', status: 'completed' },
        { id: 'function-item', type: 'function_call', name: 'generate_image', call_id: 'function-call' },
        { id: 'batch-item', type: 'function_call', name: 'generate_image_batch', call_id: 'batch-call' },
      ],
    })
    const blocks = getAgentAssistantBlocks(
      currentRound,
      tasks.map((item) => ({ taskId: item.id, task: item })),
      tasks,
      '不会重复追加',
    )

    expect(blocks.map((block) => [block.kind, block.id])).toEqual([
      [AGENT_WEB_SEARCH_KIND, 'web-search:0:search-1:search-2'],
      [CHAT_TEXT_KIND, 'text:text-1'],
      [AGENT_IMAGE_TASK_KIND, 'image:task-built-in'],
      [AGENT_IMAGE_TASK_KIND, 'image:task-function'],
      [AGENT_IMAGE_TASK_KIND, 'image:task-batch-a'],
      [AGENT_IMAGE_TASK_KIND, 'image:task-batch-b'],
    ])
  })

  it('marks unfinished search and batch parameter blocks as stopped', () => {
    const blocks = getAgentAssistantBlocks(round({
      status: 'error',
      error: '已停止生成。',
      responseOutput: [
        { id: 'search-1', type: 'web_search_call', status: 'in_progress', action: { type: 'search' } },
        { id: 'batch-1', type: 'function_call', name: 'generate_image_batch', call_id: 'batch-call' },
      ],
    }), [], [], '已停止生成。')
    const statuses = blocks
      .filter((block) => block.kind === AGENT_WEB_SEARCH_KIND)
      .map((block) => (block.payload as AgentWebSearchBlockPayload).status)

    expect(statuses).toEqual([
      { text: '已停止搜索网页', completed: true },
      { text: '已停止填写并发图像生成参数', completed: true },
    ])
    expect(blocks[blocks.length - 1]).toMatchObject({ kind: CHAT_TEXT_KIND, content: '已停止生成。' })
  })

  it('keeps failed search completed and adapts errors without changing AgentMessage storage', () => {
    const currentRound = round({
      status: 'error',
      error: '请求失败',
      responseOutput: [{ id: 'search-1', type: 'web_search_call', status: 'failed', action: 'search' }],
    })
    const assistant: AgentMessage = {
      id: 'assistant-1',
      role: 'assistant',
      roundId: currentRound.id,
      content: '请求失败：上游错误',
      createdAt: 2,
    }
    const conversation: AgentConversation = {
      id: 'conversation-1',
      title: '测试',
      activeRoundId: currentRound.id,
      createdAt: 1,
      updatedAt: 2,
      rounds: [currentRound],
      messages: [assistant],
    }
    const viewMessage = getAgentConversationMessages([assistant], conversation, [])[0]
    const payload = viewMessage.payload as AgentConversationMessagePayload

    expect(viewMessage.kind).toBe(CHAT_TEXT_KIND)
    expect(payload.error).toBe(true)
    expect((payload.blocks[0].payload as AgentWebSearchBlockPayload).status).toEqual({ text: '搜索失败', completed: true })
    expect(assistant).not.toHaveProperty('kind')
    expect(assistant).not.toHaveProperty('payload')
  })
})
