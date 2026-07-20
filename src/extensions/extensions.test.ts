import { describe, expect, it } from 'vitest'
import { defineExtensions } from './shared/types'
import { skills } from './skills'
import { tools } from './tools'
import { workflows } from './workflows'

describe('extension registries', () => {
  it('keeps each extension category independent', () => {
    expect(skills).toEqual([])
    expect(workflows).toEqual([])
    expect(tools).toEqual([])
    expect(skills).not.toBe(workflows)
    expect(workflows).not.toBe(tools)
  })

  it('rejects duplicate ids in one registry', () => {
    expect(() => defineExtensions([
      { id: 'same', name: 'A', description: '' },
      { id: 'same', name: 'B', description: '' },
    ])).toThrow('扩展 ID 重复：same')
  })
})
