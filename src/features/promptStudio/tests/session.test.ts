import { describe, expect, it } from 'vitest'
import type {
  PromptArtifact,
  PromptDomainDefinition,
  PromptInterviewReply,
} from '../types'
import { createPromptDomainRegistry } from '../core/domains'
import {
  applyPromptInterviewReply,
  applyPromptOptimizationReply,
  applyPromptProjectPatch,
  createPromptProject,
  failPromptGeneration,
  finishPromptGeneration,
  retryPromptGeneration,
  saveManualPromptVersion,
  startPromptGeneration,
  startPromptOptimization,
} from '../core/session'

const domain: PromptDomainDefinition = {
  id: 'dummy',
  label: '测试领域',
  fields: [
    { id: 'goal', label: '目标', group: '目标', required: true },
    { id: 'subject', label: '主体', group: '主体', required: true },
    { id: 'lighting', label: '光线', group: '视觉', required: true },
  ],
  buildInstructions: () => '测试访谈',
  buildArtifactInstructions: () => '测试产物',
  canInheritFrom: [],
}

const answer = (field: string, value: string) => ({
  field,
  value,
  status: 'answered' as const,
  origin: 'user' as const,
  locked: true,
})

const question = (field: string) => ({
  id: `question-${field}`,
  field,
  text: `${field} 是什么？`,
  input: 'text' as const,
  options: [],
  required: true,
})

const createProject = () => createPromptProject({
  id: 'project-1',
  conversationId: 'conversation-1',
  title: '测试项目',
  source: { type: 'text', text: '制作海报' },
  domain,
  now: 1,
})

const completeReply = (): PromptInterviewReply => ({
  phase: 'review',
  message: '请确认需求',
  briefPatch: [
    answer('goal', '宣传海报'),
    answer('subject', '香水瓶'),
    answer('lighting', '柔和侧光'),
  ],
  questions: [],
})

const artifact: PromptArtifact = {
  domain: 'dummy',
  title: '香水海报',
  prompt: '一只香水瓶，柔和侧光，商业摄影',
  params: { ratio: '4:5' },
}

describe('prompt studio session', () => {
  it('computes interview phase when required fields are missing', () => {
    const reply: PromptInterviewReply = {
      phase: 'review',
      message: '还需补充主体和光线',
      briefPatch: [answer('goal', '宣传海报')],
      questions: [question('subject'), question('lighting')],
    }

    const result = applyPromptInterviewReply(createProject(), reply, domain, {
      messageId: 'message-1',
      now: 2,
    })

    expect(result.project.phase).toBe('interview')
    expect(result.project.messages[0]).toMatchObject({
      id: 'message-1',
      questionIds: ['question-subject', 'question-lighting'],
    })
    expect(() => startPromptGeneration(result.project, domain)).toThrow('只有需求确认阶段可以生成完整提示词')
  })

  it('requires explicit review confirmation before entering ready', () => {
    const reviewed = applyPromptInterviewReply(createProject(), completeReply(), domain, {
      now: 2,
    }).project

    expect(reviewed.phase).toBe('review')
    expect(() => finishPromptGeneration(
      { ...reviewed, phase: 'generating', brief: createProject().brief },
      artifact,
      domain,
    )).toThrow('必需字段尚未完成，不能进入 ready')

    const generating = startPromptGeneration(reviewed, domain, 3)
    const ready = finishPromptGeneration(generating, artifact, domain, {
      id: 'version-1',
      now: 4,
    })

    expect(generating.phase).toBe('generating')
    expect(ready.phase).toBe('ready')
    expect(ready.activeVersionId).toBe('version-1')
    expect(ready.versions[0].source).toBe('model')
  })

  it('applies the latest user answer without a confirmation step', () => {
    const reviewed = applyPromptInterviewReply(createProject(), completeReply(), domain).project
    const changed = applyPromptProjectPatch(reviewed, [answer('subject', '腕表')], domain)

    expect(changed.project.phase).toBe('review')
    expect(changed.project.brief.fields.subject.value).toBe('腕表')
    expect(changed.conflicts).toEqual([])
  })

  it('keeps user answers when a model reply disagrees', () => {
    const reviewed = applyPromptInterviewReply(createProject(), completeReply(), domain).project
    const locked = applyPromptProjectPatch(reviewed, [answer('subject', '香水瓶')], domain).project
    const project = { ...locked, phase: 'interview' as const }
    const result = applyPromptInterviewReply(project, {
      phase: 'review',
      message: '已根据当前需求整理完成',
      briefPatch: [{
        field: 'subject',
        value: '腕表',
        status: 'answered',
        origin: 'model',
        locked: false,
      }],
      questions: [],
    }, domain)

    expect(result.project.phase).toBe('review')
    expect(result.project.brief.fields.subject.value).toBe('香水瓶')
    expect(result.conflicts).toEqual([])
  })

  it('recalculates dependencies without pending conflicts', () => {
    const dependentDomain: PromptDomainDefinition = {
      ...domain,
      fields: domain.fields.map((field) => field.id === 'lighting'
        ? { ...field, dependsOn: ['subject'] }
        : field),
    }
    const project = createPromptProject({
      id: 'dependent-project',
      title: '依赖测试',
      source: { type: 'text', text: '制作海报' },
      domain: dependentDomain,
      now: 1,
    })
    const reviewed = applyPromptInterviewReply(project, completeReply(), dependentDomain).project
    const changed = applyPromptProjectPatch(reviewed, [answer('subject', '腕表')], dependentDomain)
    const later = applyPromptProjectPatch(
      changed.project,
      [answer('goal', '宣传海报')],
      dependentDomain,
    )
    expect(later.project.phase).toBe('interview')
    expect(later.conflicts).toEqual([])
    expect(later.project.pendingConflicts).toEqual([])
    expect(() => startPromptGeneration({ ...later.project, phase: 'review' }, dependentDomain))
      .toThrow('必需字段尚未完成')
  })

  it('supports generation failure and retry transitions', () => {
    const reviewed = applyPromptInterviewReply(createProject(), completeReply(), domain).project
    const generating = startPromptGeneration(reviewed, domain, 2)
    const failed = failPromptGeneration(generating, 3)
    const retried = retryPromptGeneration(failed, 4)

    expect(failed.phase).toBe('error')
    expect(retried.phase).toBe('generating')
    expect(retried.updatedAt).toBe(4)
  })

  it('rejects interview operations outside their state transitions', () => {
    const reviewed = applyPromptInterviewReply(createProject(), completeReply(), domain).project
    expect(() => applyPromptInterviewReply(reviewed, completeReply(), domain))
      .toThrow('当前阶段不允许此操作: review')

    const generating = startPromptGeneration(reviewed, domain)
    expect(() => applyPromptProjectPatch(generating, [answer('goal', '新目标')], domain))
      .toThrow('当前阶段不允许此操作: generating')
  })

  it('uses the actual editor text when continuing optimization', () => {
    const reviewed = applyPromptInterviewReply(createProject(), completeReply(), domain).project
    const ready = finishPromptGeneration(startPromptGeneration(reviewed, domain), artifact, domain, {
      id: 'version-1',
    })
    const result = startPromptOptimization(ready, '用户手动修改后的文本', '加强材质细节', 5)

    expect(result.project.phase).toBe('generating')
    expect(result.context.prompt).toBe('用户手动修改后的文本')
    expect(result.context.instruction).toBe('加强材质细节')
    expect(result.context.lockedFields).toEqual(['goal', 'subject', 'lighting'])
  })

  it('applies optimization changes without creating conflicts', () => {
    const reviewed = applyPromptInterviewReply(createProject(), completeReply(), domain).project
    const ready = finishPromptGeneration(startPromptGeneration(reviewed, domain), artifact, domain, {
      id: 'version-1',
    })
    const optimizing = startPromptOptimization(ready, artifact.prompt, '把主体改成腕表').project
    const result = applyPromptOptimizationReply(optimizing, {
      phase: 'review',
      message: '已更新主体要求',
      briefPatch: [answer('subject', '腕表')],
      questions: [],
    }, domain)

    expect(result.project.phase).toBe('review')
    expect(result.project.brief.fields.subject.value).toBe('腕表')
    expect(result.project.pendingConflicts).toEqual([])
  })

  it('does not let manual versions bypass the ready gate', () => {
    const incomplete = { ...createProject(), phase: 'ready' as const }
    expect(() => saveManualPromptVersion(incomplete, artifact, domain))
      .toThrow('必需字段尚未完成，不能进入 ready')

    const reviewed = applyPromptInterviewReply(createProject(), completeReply(), domain).project
    expect(() => saveManualPromptVersion(reviewed, artifact, domain))
      .toThrow('只有已生成的提示词可以保存人工版本')

    const ready = finishPromptGeneration(startPromptGeneration(reviewed, domain), artifact, domain, {
      id: 'version-model',
    })
    const saved = saveManualPromptVersion(ready, { ...artifact, prompt: '人工编辑稿' }, domain, {
      id: 'version-user',
    })
    expect(saved.versions.map((version) => version.source)).toEqual(['model', 'user'])
    expect(saved.activeVersionId).toBe('version-user')
  })

  it('registers a dummy domain without changing the core', () => {
    const registry = createPromptDomainRegistry([domain])
    const second = { ...domain, id: 'another-domain', label: '另一个领域' }
    registry.register(second)

    expect(registry.getAll().map((item) => item.id)).toEqual(['dummy', 'another-domain'])
    expect(registry.require('another-domain')).toBe(second)
    expect(() => registry.register(second)).toThrow('领域 ID 重复: another-domain')
  })
})
