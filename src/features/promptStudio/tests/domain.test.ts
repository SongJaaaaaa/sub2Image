import { describe, expect, it } from 'vitest'
import type { PromptBrief, PromptDomainDefinition } from '../types'
import { imageAmbiguities, imageDomain, imageFields } from '../domains/image'
import { sharedAmbiguities, sharedFields } from '../domains/shared'

const fields = new Map(imageDomain.fields.map((field) => [field.id, field]))

describe('image prompt domain', () => {
  it('registers as an open PromptDomainDefinition', () => {
    const domains: PromptDomainDefinition[] = [imageDomain]

    expect(domains.find((domain) => domain.id === 'image')).toBe(imageDomain)
    expect(imageDomain.label).toBe('图片提示词')
    expect(imageDomain.canInheritFrom).toEqual([])
    expect(imageDomain.fields).toEqual([...sharedFields, ...imageFields])
    expect(imageDomain.ambiguities).toEqual([...sharedAmbiguities, ...imageAmbiguities])
  })

  it('covers every image v1 brief area with unique stable field IDs', () => {
    const ids = imageDomain.fields.map((field) => field.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining([
      'goal.purpose',
      'goal.intent',
      'subject.type',
      'subject.count',
      'subject.identity',
      'subject.appearance',
      'subject.clothing',
      'subject.action',
      'subject.expression',
      'scene.environment',
      'scene.era',
      'scene.time',
      'scene.weather',
      'composition.shot',
      'composition.angle',
      'composition.negativeSpace',
      'composition.focus',
      'visual.style',
      'visual.medium',
      'visual.realism',
      'visual.color',
      'visual.lighting',
      'visual.material',
      'reference.roles',
      'reference.strength',
      'text.content',
      'logo.description',
      'output.aspectRatio',
      'output.size',
      'constraints.mustKeep',
      'constraints.exclude',
    ]))
  })

  it('uses explicit conditions and valid dependency references', () => {
    expect(fields.get('subject.clothing')?.appliesWhen).toEqual(expect.objectContaining({ any: expect.any(Array) }))
    expect(fields.get('scene.weather')?.appliesWhen).toEqual(expect.objectContaining({ any: expect.any(Array) }))
    expect(fields.get('reference.roles')).toMatchObject({
      required: true,
      appliesWhen: { field: 'reference.hasImages', op: 'equals', value: true },
      dependsOn: ['reference.hasImages'],
    })
    expect(fields.get('text.content')?.appliesWhen).toEqual({ field: 'text.enabled', op: 'equals', value: true })
    expect(fields.get('logo.description')?.appliesWhen).toEqual({ field: 'logo.enabled', op: 'equals', value: true })
    expect(fields.get('camera.lens')?.appliesWhen).toEqual(expect.objectContaining({ any: expect.any(Array) }))

    for (const field of imageDomain.fields) {
      for (const dependency of field.dependsOn ?? []) {
        expect(fields.has(dependency), `${field.id} 依赖了未定义字段 ${dependency}`).toBe(true)
        expect(dependency).not.toBe(field.id)
      }
    }
  })

  it('maps ambiguity terms to concrete existing fields and questions', () => {
    const rules = imageDomain.ambiguities ?? []

    expect(rules.flatMap((rule) => rule.terms)).toEqual(expect.arrayContaining(['高级感', '电影感', '氛围感', '震撼', '自然一点']))
    for (const rule of rules) {
      expect(rule.terms.length).toBeGreaterThan(0)
      expect(rule.question.length).toBeGreaterThan(20)
      for (const field of rule.fields ?? []) {
        expect(fields.has(field), `消歧规则引用了未定义字段 ${field}`).toBe(true)
      }
    }
  })

  it('builds Chinese interview and artifact instructions from the current brief', () => {
    const brief: PromptBrief = {
      domain: 'image',
      fields: {
        'goal.purpose': {
          value: '电商主图',
          status: 'answered',
          origin: 'user',
          locked: true,
          updatedAt: 1,
        },
      },
    }

    const interview = imageDomain.buildInstructions(brief)
    const artifact = imageDomain.buildArtifactInstructions(brief)

    expect(interview).toContain('每一轮请一次性返回一组问题')
    expect(interview).toContain('不要创建冲突确认问题')
    expect(interview).toContain('重新检查依赖字段')
    expect(interview).toContain('高级感')
    expect(interview).toContain('电商主图')
    expect(artifact).toContain('完整中文提示词')
    expect(artifact).toContain('negativePrompt')
    expect(artifact).toContain('比例、尺寸')
    expect(artifact).toContain('画面文字')
    expect(artifact).toContain('Logo')
    expect(artifact).toContain('电商主图')
  })
})
