import { describe, expect, it } from 'vitest'
import type { PromptArtifact, PromptProject } from '../types'
import {
  addPromptVersion,
  buildPromptOptimizationContext,
  getActivePromptVersion,
  restorePromptVersion,
} from '../core/versions'

function makeProject(): PromptProject {
  return {
    id: 'project-1',
    domain: 'image',
    title: '海报',
    source: { type: 'text', text: '创作一张海报' },
    brief: {
      domain: 'image',
      fields: {
        subject: {
          value: '香水瓶',
          status: 'answered',
          origin: 'user',
          locked: true,
          updatedAt: 1,
        },
        lighting: {
          value: '柔光',
          status: 'answered',
          origin: 'model',
          locked: false,
          updatedAt: 1,
        },
      },
    },
    messages: [],
    pendingConflicts: [],
    versions: [],
    phase: 'generating',
    schemaVersion: 1,
    createdAt: 1,
    updatedAt: 1,
  }
}

function makeArtifact(prompt: string): PromptArtifact {
  return {
    domain: 'image',
    title: '香水海报',
    prompt,
    params: { ratio: '4:5' },
    shotList: [{ index: 1, prompt: '产品特写' }],
  }
}

describe('prompt versions', () => {
  it('添加模型和人工版本并激活最新版本', () => {
    const originalProject = makeProject()
    const sourceArtifact = makeArtifact('模型初稿')
    const modelProject = addPromptVersion(originalProject, sourceArtifact, 'model', {
      id: 'version-model',
      instruction: '生成初稿',
      now: 10,
    })
    const userProject = addPromptVersion(modelProject, makeArtifact('人工编辑稿'), 'user', {
      id: 'version-user',
      now: 20,
    })

    expect(modelProject.versions[0]).toMatchObject({
      id: 'version-model',
      source: 'model',
      instruction: '生成初稿',
      createdAt: 10,
    })
    expect(userProject.versions.map((version) => version.source)).toEqual(['model', 'user'])
    expect(userProject.activeVersionId).toBe('version-user')
    expect(userProject.phase).toBe('ready')
    expect(userProject.updatedAt).toBe(20)
    expect(getActivePromptVersion(userProject)?.artifact.prompt).toBe('人工编辑稿')

    sourceArtifact.params.ratio = '1:1'
    sourceArtifact.shotList![0].prompt = '已修改'
    expect(modelProject.versions[0].artifact.params.ratio).toBe('4:5')
    expect(modelProject.versions[0].artifact.shotList?.[0].prompt).toBe('产品特写')
    expect(originalProject.versions).toEqual([])
    expect(originalProject.phase).toBe('generating')
  })

  it('恢复旧版本只切换 active version，不丢失历史', () => {
    const first = addPromptVersion(makeProject(), makeArtifact('第一版'), 'model', {
      id: 'version-1',
      now: 10,
    })
    const second = addPromptVersion(first, makeArtifact('第二版'), 'model', {
      id: 'version-2',
      now: 20,
    })
    const restored = restorePromptVersion(second, 'version-1', 30)

    expect(restored.activeVersionId).toBe('version-1')
    expect(getActivePromptVersion(restored)?.artifact.prompt).toBe('第一版')
    expect(restored.versions.map((version) => version.id)).toEqual(['version-1', 'version-2'])
    expect(restored.updatedAt).toBe(30)
    expect(second.activeVersionId).toBe('version-2')

    const interview = restorePromptVersion({ ...second, phase: 'interview' }, 'version-1', 40)
    expect(interview.phase).toBe('interview')
  })

  it('拒绝恢复不存在的版本', () => {
    expect(() => restorePromptVersion(makeProject(), 'missing', 10))
      .toThrow('提示词版本不存在: missing')
    expect(getActivePromptVersion(makeProject())).toBeUndefined()
  })

  it('继续优化使用编辑器实际文本并保留锁定字段', () => {
    const project = addPromptVersion(makeProject(), makeArtifact('模型版本文本'), 'model', {
      id: 'version-model',
      now: 10,
    })
    const context = buildPromptOptimizationContext(
      project,
      '用户在编辑器中修改后的实际文本',
      '让光线更柔和',
    )

    expect(context.prompt).toBe('用户在编辑器中修改后的实际文本')
    expect(context.prompt).not.toBe(context.activeVersion?.artifact.prompt)
    expect(context.instruction).toBe('让光线更柔和')
    expect(context.brief).toBe(project.brief)
    expect(context.lockedFields).toEqual(['subject'])
    expect(context.activeVersion?.id).toBe('version-model')
  })
})
