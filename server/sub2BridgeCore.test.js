import { describe, expect, it } from 'vitest'
import { findUserKey, matchAccounts, mergeModels } from './sub2BridgeCore.mjs'

describe('Sub2API bridge core', () => {
  it('only accepts a key owned by the current user response', () => {
    const data = { items: [{ id: 1, name: 'A' }] }
    expect(findUserKey(data, 1)?.name).toBe('A')
    expect(findUserKey(data, 2)).toBeNull()
  })

  it('matches active accounts in the selected key group', () => {
    const data = { items: [
      { id: 1, status: 'active', group_ids: [2] },
      { id: 2, status: 'inactive', group_ids: [2] },
      { id: 3, status: 'active', group_ids: [3] },
    ] }
    expect(matchAccounts(data, 2).map((item) => item.id)).toEqual([1])
  })

  it('merges and deduplicates models from multiple accounts', () => {
    expect(mergeModels([
      [{ id: 'gpt-5.5' }, { id: 'gpt-image-2' }],
      [{ id: 'gpt-image-2' }, { id: 'grok-imagine' }],
    ]).map((item) => item.id)).toEqual(['gpt-5.5', 'gpt-image-2', 'grok-imagine'])
  })
})
