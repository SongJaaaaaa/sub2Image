import { describe, expect, it } from 'vitest'
import { createRequestControllers } from '../runtime/requestControllers'

describe('conversation request controllers', () => {
  it('gives every request an independent requestId', () => {
    const requests = createRequestControllers()
    const toolA = requests.start({ conversationId: 'conversation-1', toolId: 'tool-a' })
    const toolB = requests.start({ conversationId: 'conversation-1', toolId: 'tool-b' })

    expect(toolA.requestId).not.toBe(toolB.requestId)
    expect(toolA.signal).not.toBe(toolB.signal)
  })

  it('stops one Tool without affecting another Tool', () => {
    const requests = createRequestControllers()
    const scopeA = { conversationId: 'conversation-1', toolId: 'tool-a' }
    const scopeB = { conversationId: 'conversation-1', toolId: 'tool-b' }
    const toolA = requests.start(scopeA)
    const toolB = requests.start(scopeB)

    requests.abort(scopeA)

    expect(toolA.signal.aborted).toBe(true)
    expect(toolA.isCurrent()).toBe(false)
    expect(toolB.signal.aborted).toBe(false)
    expect(toolB.isCurrent()).toBe(true)
  })

  it('invalidates the previous request in the same scope', () => {
    const requests = createRequestControllers()
    const scope = { conversationId: 'conversation-1', toolId: 'tool-a' }
    const first = requests.start(scope)
    const second = requests.start(scope)

    expect(first.signal.aborted).toBe(true)
    expect(first.isCurrent()).toBe(false)
    expect(second.isCurrent()).toBe(true)
  })
})
