// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type AgentRound, type TaskRecord } from '../../src/types'
import { createConversationRuntime, type ConversationMessage, type ConversationTool } from '../../src/features/conversationComposer'
import { ConversationView, createMessageRendererRegistry } from '../../src/features/conversationView'
import { getAgentAssistantBlocks } from '../../src/integrations/conversation/agentMessageBlocks'
import {
  createSub2ImageMessageRendererRegistry,
  IMAGE_GENERATION_RESULT_KIND,
  registerSub2ImageMessageRenderers,
} from '../../src/integrations/conversation/conversationMessageRenderers'

const message = (id: string, kind: ConversationMessage['kind'], content: string): ConversationMessage => ({
  id,
  role: 'assistant',
  kind,
  content,
  createdAt: 1,
})

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
  prompt: patch.prompt ?? id,
  params: patch.params ?? { ...DEFAULT_PARAMS },
  inputImageIds: patch.inputImageIds ?? [],
  outputImages: patch.outputImages ?? [],
  status: patch.status ?? 'done',
  error: patch.error ?? null,
  createdAt: patch.createdAt ?? 1,
  finishedAt: patch.finishedAt ?? 2,
  elapsed: patch.elapsed ?? 1,
  ...patch,
})

afterEach(cleanup)

describe('ConversationView', () => {
  it('renders a newly loaded Tool message through the host registry', async () => {
    const Renderer = ({ message: item }: { message: ConversationMessage }) => <strong data-loaded-tool-result>{item.content}</strong>
    const registry = createMessageRendererRegistry()
    const tool: ConversationTool = {
      id: 'dummy',
      label: 'Dummy',
      getComposerState: ({ running }) => ({
        placeholder: 'Dummy',
        canSubmit: !running,
        validationError: null,
        running,
      }),
      load: async () => ({
        messageRenderers: { 'dummy/result': Renderer },
        validate: () => null,
        submit: async () => undefined,
      }),
    }
    const runtime = createConversationRuntime({
      tools: [tool],
      onToolLoaded: (_toolId, module) => registerSub2ImageMessageRenderers(module.messageRenderers, registry),
    })

    await runtime.loadTool(tool.id)
    render(<ConversationView messages={[message('dummy-loaded', 'dummy/result', 'Tool 扩展结果')]} registry={registry} />)

    expect(screen.getByText('Tool 扩展结果').closest('[data-loaded-tool-result]')).toBeTruthy()
  })

  it('dispatches newly registered renderers without changing the generic list', () => {
    const registry = createMessageRendererRegistry()
    registry.register('dummy/result', ({ message: item }) => <strong data-dummy-result>{item.content}</strong>)

    render(<ConversationView messages={[message('dummy-1', 'dummy/result', '扩展结果')]} registry={registry} />)

    expect(screen.getByText('扩展结果').closest('[data-dummy-result]')).toBeTruthy()
  })

  it('replaces a mounted fallback immediately after its renderer loads', () => {
    const registry = createMessageRendererRegistry()
    render(<ConversationView messages={[message('late', 'late/result', '延迟结果')]} registry={registry} />)
    expect(screen.getByText('延迟结果').closest('[data-late-result]')).toBeNull()

    act(() => registry.register('late/result', ({ message: item }) => <strong data-late-result>{item.content}</strong>))

    expect(screen.getByText('延迟结果').closest('[data-late-result]')).toBeTruthy()
  })

  it('falls back per unknown message and continues rendering later messages', () => {
    const registry = createSub2ImageMessageRendererRegistry()
    registry.register('dummy/result', ({ message: item }) => <strong data-dummy-result>{item.content}</strong>)
    render(<ConversationView messages={[
      message('unknown-text', 'unknown/text', '兼容文本'),
      message('unknown-empty', 'unknown/empty', ''),
      message('dummy-result', 'dummy/result', '后续扩展结果'),
    ]} registry={registry} />)

    expect(screen.getByText('兼容文本')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('无法显示消息：unknown/empty')
    expect(screen.getByText('后续扩展结果').closest('[data-dummy-result]')).toBeTruthy()
  })

  it('renders failed and stopped Agent web search as completed visible states', () => {
    const failed = getAgentAssistantBlocks(round({
      id: 'round-failed-search',
      status: 'error',
      error: '请求失败',
      responseOutput: [{ id: 'search-failed', type: 'web_search_call', status: 'failed', action: { type: 'search' } }],
    }), [], [], '')
    const stopped = getAgentAssistantBlocks(round({
      id: 'round-stopped-search',
      status: 'error',
      error: '已停止生成。',
      responseOutput: [{ id: 'search-stopped', type: 'web_search_call', status: 'in_progress', action: { type: 'search' } }],
    }), [], [], '')

    render(<ConversationView messages={[...failed, ...stopped]} registry={createSub2ImageMessageRendererRegistry()} />)

    const failedStatus = screen.getByText('搜索失败')
    const stoppedStatus = screen.getByText('已停止搜索网页')
    expect(failedStatus.classList.contains('agent-web-search-running-text')).toBe(false)
    expect(stoppedStatus.classList.contains('agent-web-search-running-text')).toBe(false)
  })

  it('renders every batch image task plus stopped and missing task states', () => {
    const batchA = task('task-batch-a', { prompt: '批量任务 A', agentBatchCallId: 'batch-call' })
    const batchB = task('task-batch-b', { prompt: '批量任务 B', agentBatchCallId: 'batch-call' })
    const stoppedTask = task('task-stopped', {
      prompt: '已停止图片任务',
      status: 'error',
      error: '已停止生成。',
    })
    const batch = getAgentAssistantBlocks(round({
      id: 'round-batch',
      outputTaskIds: [batchA.id, batchB.id],
      responseOutput: [{ id: 'batch-item', type: 'function_call', name: 'generate_image_batch', call_id: 'batch-call' }],
    }), [
      { taskId: batchA.id, task: batchA },
      { taskId: batchB.id, task: batchB },
    ], [batchA, batchB], '')
    const states = getAgentAssistantBlocks(round({
      id: 'round-task-states',
      outputTaskIds: [stoppedTask.id, 'task-missing'],
    }), [
      { taskId: stoppedTask.id, task: stoppedTask },
      { taskId: 'task-missing', task: null },
    ], [stoppedTask], '')

    render(<ConversationView messages={[...batch, ...states]} registry={createSub2ImageMessageRendererRegistry()} />)

    expect(screen.getByText('批量任务 A')).toBeTruthy()
    expect(screen.getByText('批量任务 B')).toBeTruthy()
    expect(screen.getByText('已停止图片任务')).toBeTruthy()
    expect(screen.getByText('已停止', { exact: true })).toBeTruthy()
    expect(screen.getByText('[Image Removed]')).toBeTruthy()
  })

  it('renders an image-generation result through its registered renderer', () => {
    const resultTask = task('image-result', { prompt: '独立图片生成结果' })
    render(<ConversationView messages={[{
      ...message('image-result', IMAGE_GENERATION_RESULT_KIND, ''),
      payload: {
        type: 'agent-image-task',
        taskId: resultTask.id,
        task: resultTask,
      },
    }]} registry={createSub2ImageMessageRendererRegistry()} />)

    expect(screen.getByText('独立图片生成结果')).toBeTruthy()
  })

})
