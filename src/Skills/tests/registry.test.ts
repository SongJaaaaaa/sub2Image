import { describe, expect, it } from 'vitest'
import { defineGenerationSkills } from '../registry'

const skill = {
  id: 'product-photo',
  name: '电商产品图',
  description: '生成产品摄影描述',
  version: 1,
  instructions: '输出完整产品摄影描述',
  supports: ['text-to-image' as const],
}

describe('Generation Skill registry', () => {
  it('keeps registered skills in order', () => {
    expect(defineGenerationSkills([skill])).toEqual([skill])
  })

  it('rejects duplicate ids', () => {
    expect(() => defineGenerationSkills([skill, { ...skill }])).toThrow('Generation Skill ID 重复：product-photo')
  })
})
