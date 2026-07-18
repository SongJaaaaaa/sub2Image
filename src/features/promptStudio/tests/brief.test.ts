import { describe, expect, it } from 'vitest'
import type {
  PromptBriefPatchEntry,
  PromptDomainDefinition,
} from '../types'
import {
  createPromptBrief,
  getMissingPromptFields,
  isPromptBriefComplete,
  mergePromptBrief,
} from '../core/brief'
import { getQuestionablePromptFields } from '../core/questions'

const domain: PromptDomainDefinition = {
  id: 'dummy',
  label: '测试',
  fields: [
    { id: 'goal', label: '目标', group: '目标', required: true },
    { id: 'time', label: '时间', group: '场景', required: true },
    { id: 'lighting', label: '光线', group: '视觉', required: true, dependsOn: ['time'] },
    { id: 'subject.type', label: '主体类型', group: '主体', required: false },
    {
      id: 'subject.clothing',
      label: '服装',
      group: '主体',
      required: false,
      appliesWhen: { field: 'subject.type', op: 'equals', value: '人物' },
      dependsOn: ['subject.type'],
    },
    { id: 'text.enabled', label: '需要文字', group: '文字', required: false },
    {
      id: 'text.content',
      label: '文字内容',
      group: '文字',
      required: true,
      appliesWhen: { field: 'text.enabled', op: 'equals', value: true },
      dependsOn: ['text.enabled'],
    },
    { id: 'visual.style', label: '风格', group: '视觉', required: false },
  ],
  ambiguities: [
    {
      terms: ['高级感', '电影感'],
      fields: ['visual.style'],
      question: '请把抽象风格拆成可观察的画面特征',
    },
  ],
  buildInstructions: () => '',
  buildArtifactInstructions: () => '',
  canInheritFrom: [],
}

const answer = (
  field: string,
  value: PromptBriefPatchEntry['value'],
  origin: PromptBriefPatchEntry['origin'] = 'user',
  locked = origin !== 'model',
): PromptBriefPatchEntry => ({
  field,
  value,
  status: 'answered',
  origin,
  locked,
})

describe('prompt brief', () => {
  it('merges incremental patches without losing existing fields', () => {
    const first = mergePromptBrief(createPromptBrief(domain, 1), [answer('goal', '商品海报')], domain, 2)
    const second = mergePromptBrief(first.brief, [answer('time', '夜晚')], domain, 3)

    expect(second.brief.fields.goal.value).toBe('商品海报')
    expect(second.brief.fields.goal.updatedAt).toBe(2)
    expect(second.brief.fields.time.value).toBe('夜晚')
  })

  it('lets the latest user answer replace an older locked answer', () => {
    const first = mergePromptBrief(createPromptBrief(domain), [answer('time', '白天')], domain)
    const second = mergePromptBrief(first.brief, [answer('time', '雨夜')], domain)

    expect(second.brief.fields.time.value).toBe('雨夜')
    expect(second.conflicts).toEqual([])
  })

  it('normalizes lock ownership from field origin', () => {
    const result = mergePromptBrief(createPromptBrief(domain), [
      { ...answer('goal', '商品海报'), locked: false },
      { ...answer('visual.style', '极简留白', 'model', true), locked: true },
    ], domain)

    expect(result.brief.fields.goal.locked).toBe(true)
    expect(result.brief.fields['visual.style'].locked).toBe(false)
  })

  it('does not count empty answered values as complete', () => {
    const result = mergePromptBrief(createPromptBrief(domain), [
      answer('goal', null),
      answer('time', '   '),
      answer('lighting', []),
    ], domain)

    expect(result.issues.map((issue) => issue.code)).toEqual([
      'empty-answer',
      'empty-answer',
      'empty-answer',
    ])
    expect(isPromptBriefComplete(result.brief, domain)).toBe(false)
    expect(result.brief.fields.goal.status).toBe('missing')
  })

  it('keeps a user field when a later model patch disagrees', () => {
    const initial = mergePromptBrief(createPromptBrief(domain), [answer('time', '白天')], domain)
    const result = mergePromptBrief(initial.brief, [answer('time', '雨夜', 'model', false)], domain)

    expect(result.brief.fields.time.value).toBe('白天')
    expect(result.conflicts).toEqual([])
  })

  it('invalidates model dependencies after a user changes a locked parent', () => {
    const initial = mergePromptBrief(createPromptBrief(domain), [
      answer('time', '白天'),
      answer('lighting', '柔和自然光', 'model', false),
    ], domain)
    const changed = mergePromptBrief(initial.brief, [answer('time', '雨夜')], domain)

    expect(changed.brief.fields.time.value).toBe('雨夜')
    expect(changed.brief.fields.lighting).toMatchObject({ value: null, status: 'missing' })
    expect(changed.invalidatedFields).toContain('lighting')
    expect(getQuestionablePromptFields(changed.brief, domain).map((field) => field.id)).toContain('lighting')
  })

  it('automatically clears locked dependencies after a parent change', () => {
    const initial = mergePromptBrief(createPromptBrief(domain), [
      answer('time', '白天'),
      answer('lighting', '窗外日光'),
    ], domain)
    const changed = mergePromptBrief(initial.brief, [answer('time', '雨夜')], domain)

    expect(changed.brief.fields.lighting).toMatchObject({ value: null, status: 'missing' })
    expect(changed.conflicts).toEqual([])
  })

  it('does not invalidate dependencies when only origin and lock metadata change', () => {
    const initial = mergePromptBrief(createPromptBrief(domain), [
      answer('time', '白天', 'model', false),
      answer('lighting', '柔和自然光', 'model', false),
    ], domain)
    const confirmed = mergePromptBrief(initial.brief, [answer('time', '白天')], domain)

    expect(confirmed.brief.fields.time).toMatchObject({ value: '白天', origin: 'user', locked: true })
    expect(confirmed.brief.fields.lighting).toMatchObject({ value: '柔和自然光', status: 'answered' })
    expect(confirmed.invalidatedFields).not.toContain('lighting')
  })

  it('automatically clears a locked conditional field when it no longer applies', () => {
    const initial = mergePromptBrief(createPromptBrief(domain), [
      answer('subject.type', '人物'),
      answer('subject.clothing', '黑色风衣'),
    ], domain)
    const changed = mergePromptBrief(initial.brief, [answer('subject.type', '商品')], domain)

    expect(changed.brief.fields['subject.clothing']).toMatchObject({
      value: null,
      status: 'not-applicable',
      locked: false,
    })
    expect(changed.conflicts).toEqual([])
  })

  it('supports answered, delegated and not-applicable completion states', () => {
    const result = mergePromptBrief(createPromptBrief(domain), [
      answer('goal', '封面'),
      { field: 'time', value: null, status: 'delegated', origin: 'user', locked: true },
      { field: 'lighting', value: null, status: 'not-applicable', origin: 'user', locked: true },
    ], domain)

    expect(getMissingPromptFields(result.brief, domain)).toEqual([])
    expect(isPromptBriefComplete(result.brief, domain)).toBe(true)
  })

  it('reopens conditional fields when they become applicable', () => {
    const brief = createPromptBrief(domain)
    expect(brief.fields['text.content'].status).toBe('not-applicable')

    const enabled = mergePromptBrief(brief, [answer('text.enabled', true)], domain)

    expect(enabled.brief.fields['text.content'].status).toBe('missing')
    expect(getMissingPromptFields(enabled.brief, domain).map((field) => field.id)).toContain('text.content')
  })

  it('does not keep an unlocked value for a field that is not applicable', () => {
    const result = mergePromptBrief(createPromptBrief(domain), [
      answer('subject.type', '商品'),
      answer('subject.clothing', '黑色风衣', 'model', false),
    ], domain)

    expect(result.brief.fields['subject.clothing']).toMatchObject({
      value: null,
      status: 'not-applicable',
      locked: false,
    })
  })

  it('does not accept vague concepts as completed visual fields', () => {
    const result = mergePromptBrief(createPromptBrief(domain), [answer('visual.style', '做得更有高级感')], domain)

    expect(result.brief.fields['visual.style'].status).toBe('missing')
    expect(result.issues).toEqual([
      {
        field: 'visual.style',
        code: 'ambiguous-value',
        message: '请把抽象风格拆成可观察的画面特征',
      },
    ])
  })
})
