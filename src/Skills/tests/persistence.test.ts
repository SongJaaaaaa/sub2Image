import { describe, expect, it } from 'vitest'
import { normalizeAgentConversations } from '../../state/persistence'

describe('Agent Skill persistence', () => {
  it('restores Skill metadata on rounds and messages', () => {
    const skill = { id: 'product-photography', name: '电商产品图', version: 1 }
    const conversations = normalizeAgentConversations([{
      id: 'conversation-1',
      title: '商品主图',
      createdAt: 1,
      updatedAt: 2,
      rounds: [{
        id: 'round-1',
        index: 1,
        userMessageId: 'message-1',
        prompt: '制作商品主图',
        inputImageIds: [],
        outputTaskIds: [],
        skill,
        status: 'done',
        error: null,
        createdAt: 1,
        finishedAt: 2,
      }],
      messages: [{
        id: 'message-1',
        role: 'user',
        content: '制作商品主图',
        roundId: 'round-1',
        skill,
        createdAt: 1,
      }],
    }])

    expect(conversations[0].rounds[0].skill).toEqual(skill)
    expect(conversations[0].messages[0].skill).toEqual(skill)
  })
})
