export type ConversationToolScope = {
  conversationId: string
  toolId: string
}

type RequestEntry = {
  requestId: string
  controller: AbortController
}

const getScopeKey = (scope: ConversationToolScope) => `${scope.conversationId}\u0000${scope.toolId}`

export function createRequestControllers() {
  const entries = new Map<string, RequestEntry>()
  let nextId = 0

  const isCurrent = (scope: ConversationToolScope, requestId: string) => {
    const entry = entries.get(getScopeKey(scope))
    return entry?.requestId === requestId && !entry.controller.signal.aborted
  }

  const abort = (scope: ConversationToolScope) => {
    const key = getScopeKey(scope)
    const entry = entries.get(key)
    if (!entry) return false
    entries.delete(key)
    entry.controller.abort(new DOMException('请求已停止', 'AbortError'))
    return true
  }

  const start = (scope: ConversationToolScope) => {
    abort(scope)
    const requestId = `request-${++nextId}`
    const controller = new AbortController()
    entries.set(getScopeKey(scope), { requestId, controller })

    return {
      requestId,
      signal: controller.signal,
      isCurrent: () => isCurrent(scope, requestId),
      finish: () => {
        if (isCurrent(scope, requestId)) entries.delete(getScopeKey(scope))
      },
    }
  }

  return {
    start,
    abort,
    isCurrent,
    getRequestId: (scope: ConversationToolScope) => entries.get(getScopeKey(scope))?.requestId,
  }
}

export type ConversationRequestControllers = ReturnType<typeof createRequestControllers>
