import { describe, expect, it } from 'vitest'
import type { PromptDomainDefinition, PromptQuestion } from '../types'
import { createPromptBrief, mergePromptBrief } from '../core/brief'
import {
  limitPromptQuestions,
  validatePromptQuestions,
} from '../core/questions'

const domain: PromptDomainDefinition = {
  id: 'dummy',
  label: '测试',
  fields: [
    { id: 'goal', label: '目标', group: '目标', required: true },
    { id: 'subject', label: '主体', group: '主体', required: true },
    { id: 'style', label: '风格', group: '视觉', required: false },
    { id: 'ratio', label: '比例', group: '输出', required: false },
    { id: 'size', label: '尺寸', group: '输出', required: false },
    { id: 'text', label: '文字', group: '文字', required: false },
  ],
  buildInstructions: () => '',
  buildArtifactInstructions: () => '',
  canInheritFrom: [],
}

const question = (field: string): PromptQuestion => ({
  id: `question-${field}`,
  field,
  text: `${field} 是什么？`,
  input: 'text',
  options: [],
  required: true,
})

describe('prompt questions', () => {
  it('lets the model choose how many interview questions are needed', () => {
    const brief = createPromptBrief(domain)

    expect(validatePromptQuestions([], brief, domain, 'interview')).toEqual([])
    expect(validatePromptQuestions([question('goal')], brief, domain, 'interview')).toEqual([])
    expect(validatePromptQuestions(domain.fields.map((field) => question(field.id)), brief, domain, 'interview')).toEqual([])
    expect(validatePromptQuestions([question('goal'), question('subject')], brief, domain, 'interview')).toEqual([])
  })

  it('rejects questions in review and references to unknown fields', () => {
    const brief = createPromptBrief(domain)
    const errors = validatePromptQuestions([
      question('goal'),
      question('unknown'),
    ], brief, domain, 'review')

    expect(errors).toContain('需求确认阶段不能继续返回问题')
    expect(errors).toContain('问题引用未知字段: unknown')
  })

  it('rejects fields that are not currently applicable', () => {
    const conditional: PromptDomainDefinition = {
      ...domain,
      fields: [
        ...domain.fields,
        {
          id: 'detail',
          label: '细节',
          group: '主体',
          required: false,
          appliesWhen: { field: 'style', op: 'equals', value: 'detailed' },
        },
      ],
    }
    const brief = createPromptBrief(conditional)

    expect(validatePromptQuestions([
      question('goal'),
      question('detail'),
    ], brief, conditional, 'interview')).toContain('问题引用当前不适用字段: detail')
  })

  it('deduplicates fields without imposing a question-count cap', () => {
    const questions = [
      question('goal'),
      { ...question('goal'), id: 'goal-duplicate' },
      question('subject'),
      question('style'),
      question('ratio'),
      question('size'),
      question('text'),
    ]

    expect(limitPromptQuestions(questions).map((item) => item.field)).toEqual([
      'goal',
      'subject',
      'style',
      'ratio',
      'size',
      'text',
    ])
    expect(validatePromptQuestions([
      question('goal'),
      { ...question('goal'), id: 'goal-duplicate' },
    ], createPromptBrief(domain), domain, 'interview')).toContain('一轮不能重复询问字段: goal')
  })

  it('keeps review question-free after required fields are complete', () => {
    const brief = mergePromptBrief(createPromptBrief(domain), [
      { field: 'goal', value: '封面', status: 'answered', origin: 'user', locked: true },
      { field: 'subject', value: '人物', status: 'answered', origin: 'user', locked: true },
    ], domain).brief

    expect(validatePromptQuestions([], brief, domain, 'review')).toEqual([])
  })

  it('requires 2 to 3 recommended choices for new image questions', () => {
    const imageDomain = { ...domain, id: 'image' }
    const brief = createPromptBrief(imageDomain)
    const valid = [
      { ...question('goal'), input: 'single' as const, options: [{ label: '海报', value: 'poster' }, { label: '封面', value: 'cover' }] },
      { ...question('subject'), input: 'single' as const, options: [{ label: '人物', value: 'person' }, { label: '产品', value: 'product' }, { label: '场景', value: 'scene' }] },
    ]

    expect(validatePromptQuestions(valid, brief, imageDomain, 'interview')).toEqual([])
    expect(validatePromptQuestions([question('goal'), valid[1]], brief, imageDomain, 'interview'))
      .toContain('图片问题必须提供 2～3 个推荐选项: question-goal')
  })
})
