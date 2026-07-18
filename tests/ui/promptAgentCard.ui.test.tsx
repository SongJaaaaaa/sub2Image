// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPromptStudioTool,
  type PromptArtifact,
  type PromptDomainDefinition,
  type PromptInterviewReply,
  type PromptProject,
  type PromptStudioAssets,
  type PromptStudioStorage,
  type TextModelPort,
} from '../../src/features/promptStudio'
import Sub2ImagePromptAgentCard from '../../src/integrations/conversation/Sub2ImagePromptAgentCard'

const conversationId = 'gallery'
const stores: ReturnType<typeof createPromptStudioTool>['store'][] = []

const domain: PromptDomainDefinition = {
  id: 'image',
  label: '图片',
  fields: [
    { id: 'goal', label: '用途', group: '基础', required: true },
    { id: 'subject', label: '主体', group: '基础', required: true },
    { id: 'style', label: '风格', group: '视觉', required: false },
    { id: 'lighting', label: '光线', group: '视觉', required: false },
  ],
  buildInstructions: () => '访谈',
  buildArtifactInstructions: () => '生成',
  canInheritFrom: [],
}

const artifact: PromptArtifact = {
  domain: 'image',
  title: '金属产品海报',
  prompt: '银色液态金属耳机，冷色轮廓光，中心构图',
  params: {},
}

afterEach(async () => {
  cleanup()
  await Promise.all(stores.splice(0).map((store) => store.dispose()))
})

describe('Prompt Agent inline card', () => {
  it('访谈直接进入 Review 时自动发起 artifact HTTP 请求', async () => {
    const { bundle, respond } = createHarness(
      async () => ({
        format: 'interview',
        output: {
          phase: 'review',
          message: '需求已完整确认',
          briefPatch: [
            { field: 'goal', value: 'poster', status: 'answered', origin: 'source', locked: true },
            { field: 'subject', value: 'frog', status: 'answered', origin: 'source', locked: true },
          ],
          questions: [],
        },
        rawResponse: '{}',
      }),
      async () => ({ format: 'artifact', output: artifact, rawResponse: '{}' }),
    )
    render(<Sub2ImagePromptAgentCard conversationId={conversationId} bundle={bundle} onClose={() => undefined} />)

    await act(() => bundle.store.start(conversationId, { text: '生成一只青蛙', attachments: [] }))

    await waitFor(() => expect(bundle.store.getSnapshot(conversationId).project?.phase).toBe('ready'))
    expect(respond).toHaveBeenCalledTimes(2)
  })

  it('逐题推进、自定义回答并在 Review 后自动生成', async () => {
    const { bundle, respond } = createHarness(
      async () => ({ format: 'interview', output: interviewReply(2), rawResponse: '{}' }),
      async () => ({ format: 'artifact', output: artifact, rawResponse: '{}' }),
    )
    render(<Sub2ImagePromptAgentCard conversationId={conversationId} bundle={bundle} onClose={() => undefined} />)
    await act(() => bundle.store.start(conversationId, { text: '制作产品海报', attachments: [] }))

    await userEvent.click(await screen.findByRole('button', { name: '商业海报' }))
    const custom = await screen.findByRole('textbox', { name: '自定义答案' })
    await userEvent.type(custom, '银色液态金属耳机{Enter}')

    await waitFor(() => expect(bundle.store.getSnapshot(conversationId).project?.phase).toBe('ready'))
    expect(bundle.store.getSnapshot(conversationId).editor?.prompt).toBe(artifact.prompt)
    expect(respond).toHaveBeenCalledTimes(2)
  })

  it('返回改答会清除其后的本批答案', async () => {
    const { bundle } = createHarness(async () => ({ format: 'interview', output: interviewReply(4), rawResponse: '{}' }))
    render(<Sub2ImagePromptAgentCard conversationId={conversationId} bundle={bundle} onClose={() => undefined} />)
    await act(() => bundle.store.start(conversationId, { text: '制作产品海报', attachments: [] }))
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '商业海报' }))
    await user.click(await screen.findByRole('button', { name: '产品主体' }))
    await user.click(screen.getByRole('button', { name: '返回' }))
    await user.click(screen.getByRole('button', { name: '返回' }))
    await user.click(await screen.findByRole('button', { name: '社交封面' }))

    const snapshot = bundle.store.getSnapshot(conversationId)
    expect(snapshot.answers['question-goal']).toEqual({ mode: 'answer', value: 'cover' })
    expect(snapshot.answers['question-subject']).toBeUndefined()
    expect(snapshot.currentQuestionId).toBe('question-subject')
  })

  it('按字段类型跳过并在关闭时暂停原题', async () => {
    const { bundle } = createHarness(async () => ({ format: 'interview', output: interviewReply(3), rawResponse: '{}' }))
    const onClose = vi.fn()
    render(<Sub2ImagePromptAgentCard conversationId={conversationId} bundle={bundle} onClose={onClose} />)
    await act(() => bundle.store.start(conversationId, { text: '制作产品海报', attachments: [] }))
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '跳过' }))
    await user.click(screen.getByRole('button', { name: '跳过' }))
    await user.click(screen.getByRole('button', { name: '跳过' }))
    const snapshot = bundle.store.getSnapshot(conversationId)
    expect(snapshot.answers['question-goal']?.mode).toBe('delegated')
    expect(snapshot.answers['question-subject']?.mode).toBe('delegated')
    expect(snapshot.answers['question-style']?.mode).toBe('not-applicable')
    await user.click(screen.getByRole('button', { name: '暂停并关闭提示词 Agent' }))
    expect(bundle.store.getSnapshot(conversationId).paused).toBe(true)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('错误与重试留在同一张卡中', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { bundle } = createHarness(
      async () => { throw new Error('模型暂时不可用') },
      async () => ({ format: 'interview', output: interviewReply(2), rawResponse: '{}' }),
    )
    render(<Sub2ImagePromptAgentCard conversationId={conversationId} bundle={bundle} onClose={() => undefined} />)
    await act(() => bundle.store.start(conversationId, { text: '制作产品海报', attachments: [] }))

    expect(await screen.findByText('模型暂时不可用')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('图片主要用于哪里？')).toBeTruthy()
  })

  it('请求失败时不会继续本地跳过旧问题', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { bundle } = createHarness(
      async () => ({ format: 'interview', output: interviewReply(3), rawResponse: '{}' }),
      async () => { throw new Error('模型暂时不可用') },
    )
    render(<Sub2ImagePromptAgentCard conversationId={conversationId} bundle={bundle} onClose={() => undefined} />)
    await act(() => bundle.store.start(conversationId, { text: '制作产品海报', attachments: [] }))

    await userEvent.click(await screen.findByRole('button', { name: '跳过' }))
    await userEvent.click(screen.getByRole('button', { name: '跳过' }))
    await userEvent.click(screen.getByRole('button', { name: '跳过' }))

    expect(await screen.findByText('模型暂时不可用')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '跳过' })).toBeNull()
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })
})

function createHarness(...handlers: TextModelPort['respond'][]) {
  const projects = new Map<string, PromptProject>()
  const storage: PromptStudioStorage = {
    list: async () => Array.from(projects.values()),
    get: async (id) => projects.get(id) ?? null,
    getByConversationId: async (id) => Array.from(projects.values()).find((project) => project.conversationId === id) ?? null,
    put: async (project) => { projects.set(project.id, structuredClone(project)) },
    delete: async (id) => { projects.delete(id) },
  }
  const assets: PromptStudioAssets = {
    save: async (asset) => ({ id: asset.id, type: 'image', label: asset.label, role: asset.role }),
    resolve: async () => null,
    deleteIfUnused: async () => undefined,
  }
  const queue = [...handlers]
  const respond = vi.fn((input, signal) => {
    const next = queue.shift()
    if (!next) return Promise.reject(new Error('未配置模型响应'))
    return next(input, signal)
  })
  const bundle = createPromptStudioTool({ textModel: { respond }, storage, assets, domains: [domain] })
  stores.push(bundle.store)
  return { bundle, respond }
}

function interviewReply(count: 2 | 3 | 4): PromptInterviewReply {
  return {
    phase: 'interview',
    message: '需要补充画面决定',
    briefPatch: [],
    questions: [
      {
        id: 'question-goal',
        field: 'goal',
        text: '图片主要用于哪里？',
        input: 'single',
        options: [{ label: '商业海报', value: 'poster' }, { label: '社交封面', value: 'cover' }],
        required: true,
      },
      {
        id: 'question-subject',
        field: 'subject',
        text: '画面主体是什么？',
        input: 'single',
        options: [{ label: '产品主体', value: 'product' }, { label: '人物主体', value: 'person' }],
        required: true,
      },
      ...(count === 3 ? [{
        id: 'question-style',
        field: 'style',
        text: '希望采用什么风格？',
        input: 'single' as const,
        options: [{ label: '商业摄影', value: 'photo' }, { label: '3D 渲染', value: '3d' }],
        required: false,
      }] : count === 4 ? [{
        id: 'question-style',
        field: 'style',
        text: '希望采用什么风格？',
        input: 'single' as const,
        options: [{ label: '商业摄影', value: 'photo' }, { label: '3D 渲染', value: '3d' }],
        required: false,
      }, {
        id: 'question-lighting',
        field: 'lighting',
        text: '希望采用什么光线？',
        input: 'single' as const,
        options: [{ label: '柔和侧光', value: 'soft' }, { label: '冷色轮廓光', value: 'rim' }],
        required: false,
      }] : []),
    ],
  }
}
