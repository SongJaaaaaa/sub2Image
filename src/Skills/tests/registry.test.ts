import { describe, expect, it } from 'vitest'
import { agentSkills, defineAgentSkills, parseAgentSkill } from '../registry'

const skill = {
  id: 'product-photography',
  name: '电商产品图',
  description: '生成产品摄影提示词',
  version: 1,
  author: 'Example',
  source: 'https://example.com/skill',
  license: 'MIT',
  order: 10,
  instructions: '输出商品主图提示词',
}

describe('Agent Skill registry', () => {
  it('loads the six built-in skills in display order', () => {
    expect(agentSkills.map((item) => item.id)).toEqual([
      'product-photography',
      'character-consistency',
      'image-editing',
      'poster-design',
      'storyboard',
      'video-prompting',
    ])
  })

  it('rejects duplicate ids', () => {
    expect(() => defineAgentSkills([skill, { ...skill }])).toThrow('Agent Skill ID 重复：product-photography')
  })

  it('parses a single markdown skill file', () => {
    const raw = `---
id: product-photography
name: 电商产品图
description: 生成产品摄影提示词
version: 1
author: Example
source: https://example.com/skill
license: MIT
order: 10
---
生成商品主图。`
    expect(parseAgentSkill(raw)).toEqual({ ...skill, instructions: '生成商品主图。' })
  })
})
