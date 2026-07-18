import { describe, expect, it, vi } from 'vitest'
import type { ConversationMessageProps } from '../../conversationComposer'
import { createMessageRendererRegistry } from '../runtime/messageRendererRegistry'

const First = (_props: ConversationMessageProps) => null
const Second = (_props: ConversationMessageProps) => null

describe('message renderer registry', () => {
  it('registers initial and later renderers without changing ConversationView', () => {
    const registry = createMessageRendererRegistry({ 'chat/text': First })

    registry.register('dummy/result', Second)

    expect(registry.get('chat/text')).toBe(First)
    expect(registry.get('dummy/result')).toBe(Second)
    expect(registry.get('missing/result')).toBeUndefined()
  })

  it('rejects duplicate and non-namespaced kinds', () => {
    const registry = createMessageRendererRegistry({ 'chat/text': First })

    expect(() => registry.register('chat/text', Second)).toThrow('消息 renderer 重复: chat/text')
    expect(() => registry.register('', Second)).toThrow('消息 kind 必须包含命名空间: (空)')
    expect(() => registry.register('text', Second)).toThrow('消息 kind 必须包含命名空间: text')
  })

  it('returns a snapshot of registered renderers', () => {
    const registry = createMessageRendererRegistry({ 'chat/text': First })
    const snapshot = registry.getAll()

    snapshot.set('dummy/result', Second)

    expect(registry.get('dummy/result')).toBeUndefined()
  })

  it('notifies subscribers only after a successful registration', () => {
    const registry = createMessageRendererRegistry()
    const listener = vi.fn()
    const unsubscribe = registry.subscribe(listener)

    registry.register('chat/text', First)
    expect(listener).toHaveBeenCalledOnce()
    expect(registry.getVersion()).toBe(1)

    expect(() => registry.register('chat/text', Second)).toThrow('消息 renderer 重复: chat/text')
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    registry.register('dummy/result', Second)
    expect(listener).toHaveBeenCalledOnce()
  })
})
