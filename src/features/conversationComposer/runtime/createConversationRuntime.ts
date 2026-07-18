import type { ConversationMessage, ConversationSubmitInput, ConversationTool, ConversationToolContext, ConversationToolModule } from '../types'
import { createRequestControllers, type ConversationToolScope } from './requestControllers'
import { createToolRegistry } from './toolRegistry'

type AppendMessageMeta = ConversationToolScope & {
  requestId: string
}

type ConversationRuntimeOptions = {
  tools?: readonly ConversationTool[]
  onAppendMessage?: (message: ConversationMessage, meta: AppendMessageMeta) => void
  onToolLoaded?: (toolId: string, module: ConversationToolModule) => void
}

type SubmitOptions = ConversationToolScope & {
  input: ConversationSubmitInput
}

const getScopeKey = (scope: ConversationToolScope) => `${scope.conversationId}\u0000${scope.toolId}`

export function createConversationRuntime(opts: ConversationRuntimeOptions = {}) {
  const registry = createToolRegistry(opts.tools)
  const requests = createRequestControllers()
  const states = new Map<string, unknown>()
  const loadedToolIds = new Set<string>()

  const getToolState = <T = unknown>(scope: ConversationToolScope) => states.get(getScopeKey(scope)) as T | undefined
  const setToolState = (scope: ConversationToolScope, state: unknown) => {
    states.set(getScopeKey(scope), state)
  }

  const createContext = (scope: ConversationToolScope, requestId: string, allowStoppedState = false): ConversationToolContext => ({
    ...scope,
    requestId,
    appendMessage: (message) => {
      if (!requests.isCurrent(scope, requestId)) return
      opts.onAppendMessage?.(message, { ...scope, requestId })
    },
    getState: () => getToolState(scope),
    setState: (state) => {
      if (!allowStoppedState && !requests.isCurrent(scope, requestId)) return
      setToolState(scope, state)
    },
    isCurrent: () => requests.isCurrent(scope, requestId),
  })

  const loadTool = async (toolId: string) => {
    const module = await registry.load(toolId)
    if (loadedToolIds.has(toolId)) return module
    opts.onToolLoaded?.(toolId, module)
    loadedToolIds.add(toolId)
    return module
  }

  const submit = async (args: SubmitOptions) => {
    if (!registry.get(args.toolId)) throw new Error(`未知 Tool: ${args.toolId}`)

    const scope = { conversationId: args.conversationId, toolId: args.toolId }
    const request = requests.start(scope)
    const input: ConversationSubmitInput = {
      text: args.input.text,
      attachments: args.input.attachments.map((item) => ({ ...item })),
      params: { ...args.input.params },
      payload: args.input.payload,
    }

    try {
      const module = await loadTool(args.toolId)
      if (!request.isCurrent()) return request.requestId

      const err = module.validate(input)
      if (err) throw new Error(err)
      await module.submit(input, createContext(scope, request.requestId), request.signal)
      return request.requestId
    } finally {
      request.finish()
    }
  }

  const getToolComposerState = (args: SubmitOptions) => {
    const tool = registry.get(args.toolId)
    if (!tool) throw new Error(`未知 Tool: ${args.toolId}`)
    const scope = { conversationId: args.conversationId, toolId: args.toolId }
    return tool.getComposerState({
      conversationId: args.conversationId,
      input: args.input,
      running: Boolean(requests.getRequestId(scope)),
    })
  }

  const stop = (scope: ConversationToolScope) => {
    if (!registry.get(scope.toolId)) throw new Error(`未知 Tool: ${scope.toolId}`)
    const requestId = requests.getRequestId(scope)
    if (!requestId) {
      const module = registry.getLoaded(scope.toolId)
      if (!module?.stop) return false
      module.stop(createContext(scope, 'legacy', true))
      return true
    }

    requests.abort(scope)
    registry.getLoaded(scope.toolId)?.stop?.(createContext(scope, requestId, true))
    return true
  }

  return {
    registerTool: registry.register,
    getTool: registry.get,
    getTools: registry.getAll,
    loadTool,
    getToolState,
    setToolState,
    getToolComposerState,
    getRequestId: requests.getRequestId,
    isRunning: (scope: ConversationToolScope) => Boolean(requests.getRequestId(scope)),
    submit,
    stop,
  }
}

export type ConversationRuntime = ReturnType<typeof createConversationRuntime>
