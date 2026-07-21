import { describe, expect, it } from 'vitest'
import { getPromptMentionParts, insertTextMentionAtVisibleRange, stripImageMentionMarkers } from '../../lib/promptImageMentions'
import { agentSkills } from '../registry'
import { createAgentSkillMention, extractAgentSkillMention } from '../mentions'

describe('Agent Skill mentions', () => {
  const skill = agentSkills[0]
  const mention = createAgentSkillMention(skill)

  it('stores a stable id while displaying the localized name', () => {
    expect(mention).toContain('skill:product-photography')
    expect(stripImageMentionMarkers(mention)).toBe('@电商产品图')
    expect(getPromptMentionParts(`${mention} 制作商品主图`, [])[0]).toMatchObject({
      type: 'mention',
      text: '@电商产品图',
      mentionText: mention,
    })
  })

  it('extracts one selected skill from the user text', () => {
    expect(extractAgentSkillMention(`${mention} 制作商品主图`)).toEqual({
      text: '制作商品主图',
      skill: { id: 'product-photography', name: '电商产品图', version: 1 },
    })
  })

  it('keeps visible cursor mapping correct beside a skill atom', () => {
    const prompt = `${mention} 添加图片`
    const next = insertTextMentionAtVisibleRange(prompt, '@电商产品图 '.length, '@电商产品图 添加图片'.length, '@图1')
    expect(stripImageMentionMarkers(next.prompt)).toBe('@电商产品图 @图1')
  })
})
