import { describe, expect, it, vi } from 'vitest'
import type { ConversationMessage, ConversationSubmitInput, ConversationTool, ConversationToolContext, ConversationToolModule } from '../types'
import { createConversationRuntime } from '../runtime/createConversationRuntime'

const input = {
  text: '生成一张图片',
  attachments: [{ id: 'image-1', type: 'image', name: '参考图' }],
  params: { size: '1024x1024' },
}

const message: ConversationMessage = {
  id: 'message-1',
  role: 'assistant',
  kind: 'dummy/result',
  content: '完成',
  createdAt: 1,
}

const createTool = (id: string, module: ConversationToolModule): ConversationTool => ({
  id,
  label: id,
  getComposerState: ({ input, running }) => ({
    placeholder: `${id} placeholder`,
    canSubmit: Boolean(input.text.trim()) && !running,
    validationError: null,
    running,
  }),
  load: async () => module,
})

describe('conversation runtime', () => {
  it('routes one submission only to the selected Tool', async () => {
    const chatSubmit = vi.fn(async () => undefined)
    const imageSubmit = vi.fn(async () => undefined)
    const runtime = createConversationRuntime({
      tools: [
        createTool('chat', { messageRenderers: {}, validate: () => null, submit: chatSubmit }),
        createTool('image', { messageRenderers: {}, validate: () => null, submit: imageSubmit }),
      ],
    })

    await runtime.submit({ conversationId: 'conversation-1', toolId: 'image', input })

    expect(imageSubmit).toHaveBeenCalledOnce()
    expect(chatSubmit).not.toHaveBeenCalled()
  })

  it('keeps Tool state isolated by conversationId and toolId', () => {
    const runtime = createConversationRuntime()
    const chat = { conversationId: 'conversation-1', toolId: 'chat' }
    const image = { conversationId: 'conversation-1', toolId: 'image' }
    const otherChat = { conversationId: 'conversation-2', toolId: 'chat' }

    runtime.setToolState(chat, { count: 1 })
    runtime.setToolState(image, { count: 2 })
    runtime.setToolState(otherChat, { count: 3 })

    expect(runtime.getToolState(chat)).toEqual({ count: 1 })
    expect(runtime.getToolState(image)).toEqual({ count: 2 })
    expect(runtime.getToolState(otherChat)).toEqual({ count: 3 })
  })

  it('gets Composer state from the selected Tool with scoped running state', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const runtime = createConversationRuntime({
      tools: [createTool('chat', {
        messageRenderers: {},
        validate: () => null,
        submit: async () => gate,
      })],
    })
    const scope = { conversationId: 'conversation-1', toolId: 'chat' }

    expect(runtime.getToolComposerState({ ...scope, input })).toMatchObject({
      placeholder: 'chat placeholder',
      canSubmit: true,
      running: false,
    })

    const pending = runtime.submit({ ...scope, input })
    await vi.waitFor(() => expect(runtime.isRunning(scope)).toBe(true))
    expect(runtime.getToolComposerState({ ...scope, input })).toMatchObject({
      canSubmit: false,
      running: true,
    })

    release()
    await pending
  })

  it('publishes a loaded Tool module once so the host can register its renderers', async () => {
    const onToolLoaded = vi.fn()
    const module: ConversationToolModule = {
      messageRenderers: {},
      validate: () => null,
      submit: async () => undefined,
    }
    const runtime = createConversationRuntime({
      tools: [createTool('chat', module)],
      onToolLoaded,
    })

    await Promise.all([runtime.loadTool('chat'), runtime.loadTool('chat')])

    expect(onToolLoaded).toHaveBeenCalledOnce()
    expect(onToolLoaded).toHaveBeenCalledWith('chat', module)
  })

  it('uses an input snapshot for the Tool submission', async () => {
    const nextInput = {
      ...input,
      attachments: input.attachments.map((item) => ({ ...item })),
      params: { ...input.params },
    }
    let received = nextInput
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const runtime = createConversationRuntime({
      tools: [createTool('dummy', {
        messageRenderers: {},
        validate: () => null,
        submit: async (nextInput) => {
          await gate
          received = nextInput as typeof input
        },
      })],
    })

    const pending = runtime.submit({ conversationId: 'conversation-1', toolId: 'dummy', input: nextInput })
    nextInput.attachments[0].name = '已修改'
    nextInput.params.size = '512x512'
    release()
    await pending

    expect(received.attachments[0].name).toBe('参考图')
    expect(received.params.size).toBe('1024x1024')
  })

  it('keeps the integration payload on the submission snapshot', async () => {
    const payload = { draft: { prompt: '点击时草稿' } }
    const submit = vi.fn(async (_input: ConversationSubmitInput) => undefined)
    const runtime = createConversationRuntime({
      tools: [createTool('dummy', { messageRenderers: {}, validate: () => null, submit })],
    })

    await runtime.submit({
      conversationId: 'conversation-1',
      toolId: 'dummy',
      input: { ...input, payload },
    })

    expect(submit.mock.calls[0][0].payload).toBe(payload)
  })

  it('does not append a late message after stopping', async () => {
    let ctx: ConversationToolContext | undefined
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const onAppendMessage = vi.fn()
    const runtime = createConversationRuntime({
      onAppendMessage,
      tools: [createTool('dummy', {
        messageRenderers: {},
        validate: () => null,
        submit: async (_input, nextCtx) => {
          ctx = nextCtx
          await gate
          nextCtx.setState({ status: 'completed' })
          nextCtx.appendMessage(message)
        },
        stop: (stopCtx) => stopCtx.setState({ status: 'stopped' }),
      })],
    })
    const scope = { conversationId: 'conversation-1', toolId: 'dummy' }

    runtime.setToolState(scope, { status: 'running' })
    const pending = runtime.submit({ ...scope, input })
    await vi.waitFor(() => expect(ctx).toBeDefined())
    expect(runtime.stop(scope)).toBe(true)
    release()
    await pending

    expect(ctx?.isCurrent()).toBe(false)
    expect(runtime.getToolState(scope)).toEqual({ status: 'stopped' })
    expect(onAppendMessage).not.toHaveBeenCalled()
  })

  it('stops Tool A without stopping Tool B', async () => {
    const signals = new Map<string, AbortSignal>()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const makeModule = (id: string): ConversationToolModule => ({
      messageRenderers: {},
      validate: () => null,
      submit: async (_input, _ctx, signal) => {
        signals.set(id, signal)
        await gate
      },
    })
    const runtime = createConversationRuntime({
      tools: [createTool('tool-a', makeModule('tool-a')), createTool('tool-b', makeModule('tool-b'))],
    })
    const scopeA = { conversationId: 'conversation-1', toolId: 'tool-a' }
    const scopeB = { conversationId: 'conversation-1', toolId: 'tool-b' }

    const pendingA = runtime.submit({ ...scopeA, input })
    const pendingB = runtime.submit({ ...scopeB, input })
    await vi.waitFor(() => expect(signals.size).toBe(2))
    runtime.stop(scopeA)

    expect(signals.get('tool-a')?.aborted).toBe(true)
    expect(signals.get('tool-b')?.aborted).toBe(false)
    expect(runtime.isRunning(scopeB)).toBe(true)
    release()
    await Promise.all([pendingA, pendingB])
  })

  it('lets a loaded Tool stop legacy work without a Runtime request', async () => {
    const stop = vi.fn()
    const runtime = createConversationRuntime({
      tools: [createTool('chat', { messageRenderers: {}, validate: () => null, submit: async () => undefined, stop })],
    })
    const scope = { conversationId: 'conversation-1', toolId: 'chat' }
    await runtime.loadTool('chat')

    expect(runtime.stop(scope)).toBe(true)
    expect(stop).toHaveBeenCalledWith(expect.objectContaining(scope))
  })

  it('does not run a Tool when validation fails', async () => {
    const submit = vi.fn(async () => undefined)
    const runtime = createConversationRuntime({
      tools: [createTool('dummy', { messageRenderers: {}, validate: () => '请输入内容', submit })],
    })

    await expect(runtime.submit({ conversationId: 'conversation-1', toolId: 'dummy', input })).rejects.toThrow('请输入内容')
    expect(submit).not.toHaveBeenCalled()
  })

  it('runs a newly registered dummy Tool through the same core', async () => {
    const submit = vi.fn(async (_input, ctx: ConversationToolContext) => ctx.appendMessage(message))
    const onAppendMessage = vi.fn()
    const runtime = createConversationRuntime({ onAppendMessage })
    runtime.registerTool(createTool('dummy', { messageRenderers: {}, validate: () => null, submit }))

    await runtime.submit({ conversationId: 'conversation-1', toolId: 'dummy', input })

    expect(submit).toHaveBeenCalledOnce()
    expect(onAppendMessage).toHaveBeenCalledWith(message, {
      conversationId: 'conversation-1',
      toolId: 'dummy',
      requestId: expect.stringMatching(/^request-/),
    })
  })
})
