import type { ConversationMessageRenderer, ConversationMessageRenderers } from '../../conversationComposer'

export function createMessageRendererRegistry(initialRenderers: ConversationMessageRenderers = {}) {
  const renderers = new Map<string, ConversationMessageRenderer>()
  const listeners = new Set<() => void>()
  let version = 0

  const register = (kind: string, Renderer: ConversationMessageRenderer) => {
    if (!kind.includes('/')) throw new Error(`消息 kind 必须包含命名空间: ${kind || '(空)'}`)
    if (renderers.has(kind)) throw new Error(`消息 renderer 重复: ${kind}`)
    renderers.set(kind, Renderer)
    version += 1
    for (const listener of listeners) listener()
  }

  const registerAll = (nextRenderers: ConversationMessageRenderers) => {
    for (const [kind, Renderer] of Object.entries(nextRenderers)) register(kind, Renderer)
  }

  registerAll(initialRenderers)

  return {
    register,
    registerAll,
    get: (kind: string) => renderers.get(kind),
    getAll: () => new Map(renderers),
    getVersion: () => version,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type MessageRendererRegistry = ReturnType<typeof createMessageRendererRegistry>
