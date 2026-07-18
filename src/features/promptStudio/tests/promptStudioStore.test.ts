import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  PromptArtifact,
  PromptDomainDefinition,
  PromptInterviewReply,
  PromptProject,
  PromptQuestion,
} from '../types'
import type { PromptStudioAssets } from '../ports/assets'
import type { PromptStudioStorage } from '../ports/storage'
import type {
  TextModelPort,
  TextModelRequest,
  TextModelResponse,
} from '../ports/textModel'
import {
  createPromptStudioStore,
  type PromptQuestionAnswer,
  type PromptStudioStore,
} from '../store/createPromptStudioStore'

type StoredProject = PromptProject & {
  promptStudioUi?: {
    questions: PromptQuestion[]
    questionSource?: 'http'
    answers: Record<string, PromptQuestionAnswer>
    editor?: PromptArtifact
  }
}

type Respond = TextModelPort['respond']

const domain: PromptDomainDefinition = {
  id: 'image',
  label: '图片',
  fields: [
    { id: 'goal', label: '目标', group: '基础', required: true },
    { id: 'subject', label: '主体', group: '基础', required: true },
    { id: 'lighting', label: '光线', group: '视觉', required: true },
    { id: 'output.aspectRatio', label: '输出比例', group: '输出', required: false },
    { id: 'output.size', label: '输出尺寸', group: '输出', required: false },
    { id: 'output.quality', label: '质量目标', group: '输出', required: false },
    { id: 'reference.hasImages', label: '参考图', group: '参考', required: false },
    {
      id: 'reference.roles',
      label: '参考用途',
      group: '参考',
      required: true,
      appliesWhen: { field: 'reference.hasImages', op: 'equals', value: true },
      dependsOn: ['reference.hasImages'],
    },
    {
      id: 'reference.strength',
      label: '参考强度',
      group: '参考',
      required: true,
      appliesWhen: { field: 'reference.hasImages', op: 'equals', value: true },
      dependsOn: ['reference.hasImages', 'reference.roles'],
    },
  ],
  buildInstructions: () => '提取图片需求',
  buildArtifactInstructions: () => '生成图片提示词',
  canInheritFrom: [],
}

const artifact: PromptArtifact = {
  domain: 'image',
  title: '香水海报',
  prompt: '透明玻璃香水瓶，柔和侧光，商业摄影',
  negativePrompt: '低清晰度',
  params: { ratio: '4:5' },
}

const stores: PromptStudioStore[] = []

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()))
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('prompt studio store', () => {
  it('首次提取产生问题并持久化项目', async () => {
    const reply = createInterviewReply()
    const { store, projects, put } = createHarness(async () => ({
      format: 'interview',
      output: reply,
      rawResponse: '{}',
    }))

    await store.start('conversation-1', {
      text: '制作一张香水广告海报',
      attachments: [],
    })

    const snapshot = store.getSnapshot('conversation-1')
    const saved = getSavedProject(projects, 'conversation-1')
    expect(snapshot.project?.phase).toBe('interview')
    expect(snapshot.questions).toEqual(reply.questions)
    expect(snapshot.project?.brief.fields.goal.value).toBe('宣传海报')
    expect(saved?.promptStudioUi?.questions).toEqual(reply.questions)
    expect(saved?.promptStudioUi?.questionSource).toBe('http')
    expect(saved?.messages[saved.messages.length - 1]?.questionIds)
      .toEqual(['question-subject', 'question-lighting'])
    expect(put).toHaveBeenCalledTimes(2)
  })

  it('明确输出设置会锁定比例分辨率并覆盖模型 artifact 参数', async () => {
    const { store, respond } = createHarness(
      async () => ({ format: 'interview', output: createReviewReply(), rawResponse: '{}' }),
      async () => ({ format: 'artifact', output: { ...artifact, params: { size: '1024x1024', quality: 'low' } }, rawResponse: '{}' }),
    )

    await store.start('conversation-output-settings', {
      text: '制作产品海报',
      attachments: [],
      outputSettings: {
        size: '2048x2560',
        aspectRatio: '4:5',
        quality: 'high',
        output_format: 'jpeg',
        output_compression: 80,
        moderation: 'low',
        n: 2,
        transparent_output: true,
      },
    })

    const request = JSON.parse(respond.mock.calls[0]![0].input)
    expect(request.outputSettings).toEqual({
      size: '2048x2560',
      quality: 'high',
      output_format: 'jpeg',
      output_compression: 80,
      moderation: 'low',
      n: 2,
      transparent_output: true,
      aspectRatio: '4:5',
    })
    const snapshot = store.getSnapshot('conversation-output-settings')
    expect(snapshot.questions.some((question) => question.field.startsWith('output.'))).toBe(false)
    expect(snapshot.project?.brief.fields['output.aspectRatio'].value).toBe('4:5')
    expect(snapshot.project?.brief.fields['output.size'].value).toBe('2048x2560')

    await store.generate('conversation-output-settings')
    expect(store.getSnapshot('conversation-output-settings').editor?.params).toMatchObject({
      size: '2048x2560',
      quality: 'high',
      output_format: 'jpeg',
      output_compression: 80,
      moderation: 'low',
      n: 2,
      transparent_output: true,
    })
  })

  it('自动输出设置同样覆盖模型擅自返回的尺寸和质量', async () => {
    const { store } = createHarness(
      async () => ({ format: 'interview', output: createReviewReply(), rawResponse: '{}' }),
      async () => ({
        format: 'artifact',
        output: { ...artifact, params: { size: '1024x1024', quality: 'high', n: 4 } },
        rawResponse: '{}',
      }),
    )

    await store.start('conversation-auto-output-settings', {
      text: '制作产品海报',
      attachments: [],
      outputSettings: { size: 'auto', quality: 'auto', n: 1 },
    })
    await store.generate('conversation-auto-output-settings')

    expect(store.getSnapshot('conversation-auto-output-settings').editor?.params).toMatchObject({
      size: 'auto',
      quality: 'auto',
      n: 1,
    })
  })

  it('不会把输出设置重新变成访谈问题', async () => {
    const reply = createInterviewReply()
    reply.questions = [{
      id: 'question-output-ratio',
      field: 'output.aspectRatio',
      text: '画面比例需要哪种？',
      input: 'single',
      options: [
        { label: '1:1 方图', value: '1:1' },
        { label: '16:9 横图', value: '16:9' },
      ],
      required: true,
    }, ...reply.questions]
    const { store } = createHarness(async () => ({
      format: 'interview',
      output: reply,
      rawResponse: '{}',
    }))

    await store.start('conversation-output-question', {
      text: '制作一张产品海报',
      attachments: [],
      outputSettings: { size: '2048x2048', aspectRatio: '1:1', quality: 'high' },
    })

    expect(store.getSnapshot('conversation-output-question').questions.some((question) => question.field.startsWith('output.'))).toBe(false)
  })

  it('部分回答后模型失败仍保留答案', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('模型失败')
    const { store, projects, onError } = createHarness(
      async () => ({
        format: 'interview',
        output: createInterviewReply(),
        rawResponse: '{}',
      }),
      async () => {
        throw err
      },
    )
    const answer: PromptQuestionAnswer = { mode: 'answer', value: '透明玻璃香水瓶' }

    await store.start('conversation-2', { text: '制作海报', attachments: [] })
    store.setAnswer('conversation-2', 'question-subject', answer)
    await store.submitAnswers('conversation-2')

    const snapshot = store.getSnapshot('conversation-2')
    const saved = getSavedProject(projects, 'conversation-2')
    expect(snapshot.project?.phase).toBe('error')
    expect(snapshot.error).toBe('模型失败')
    expect(snapshot.answers).toEqual({ 'question-subject': answer })
    expect(snapshot.project?.brief.fields.subject).toMatchObject({
      value: '透明玻璃香水瓶',
      status: 'answered',
      origin: 'user',
      locked: true,
    })
    expect(saved?.promptStudioUi?.answers).toEqual({ 'question-subject': answer })
    expect(onError).toHaveBeenCalledWith(err)
  })

  it('stop 后丢弃迟到响应并结束运行态', async () => {
    const deferred = createDeferred<TextModelResponse>()
    let signal: AbortSignal | undefined
    const lateReply = createInterviewReply()
    lateReply.message = '这条迟到响应不应写入'
    const { store, projects, respond } = createHarness((_input, requestSignal) => {
      signal = requestSignal
      return deferred.promise
    })

    const pending = store.start('conversation-3', { text: '制作海报', attachments: [] })
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(1))
    expect(store.stop('conversation-3')).toBe(true)

    deferred.resolve({ format: 'interview', output: lateReply, rawResponse: '{}' })
    await pending

    const snapshot = store.getSnapshot('conversation-3')
    const saved = getSavedProject(projects, 'conversation-3')
    expect(signal?.aborted).toBe(true)
    expect(snapshot.running).toBe(false)
    expect(snapshot.project?.phase).toBe('error')
    expect(snapshot.project?.brief.fields.goal.status).toBe('missing')
    expect(snapshot.project?.messages).toHaveLength(1)
    expect(snapshot.questions).toEqual([])
    expect(JSON.stringify(saved)).not.toContain(lateReply.message)
  })

  it('首次写盘完成前同步进入运行态并拒绝重复提交', async () => {
    const response = createDeferred<TextModelResponse>()
    const write = createDeferred<void>()
    const { store, projects, put, respond } = createHarness(
      async () => ({ format: 'interview', output: createInterviewReply(), rawResponse: '{}' }),
      () => response.promise,
    )
    await store.start('conversation-lock', { text: '制作海报', attachments: [] })
    store.setAnswer('conversation-lock', 'question-subject', {
      mode: 'answer',
      value: '透明玻璃香水瓶',
    })
    put.mockImplementationOnce(async (project) => {
      await write.promise
      projects.set(project.id, structuredClone(project) as StoredProject)
    })

    const pending = store.submitAnswers('conversation-lock')

    expect(store.getSnapshot('conversation-lock').running).toBe(true)
    await expect(store.submitAnswers('conversation-lock')).rejects.toThrow('AI 正在处理中')
    expect(respond).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot('conversation-lock').project?.messages.filter((msg) => msg.role === 'user')).toHaveLength(2)

    write.resolve(undefined)
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2))
    response.resolve({ format: 'interview', output: createReviewReply(), rawResponse: '{}' })
    await pending
    expect(store.getSnapshot('conversation-lock').running).toBe(false)
  })

  it('请求中替换参考图会中止旧响应并保留新的来源', async () => {
    const deferred = createDeferred<TextModelResponse>()
    let signal: AbortSignal | undefined
    const lateReply = createInterviewReply()
    lateReply.message = '旧参考图响应'
    const { store, respond } = createHarness(
      (_input, requestSignal) => {
        signal = requestSignal
        return deferred.promise
      },
      async () => ({ format: 'interview', output: createInterviewReply(), rawResponse: '{}' }),
    )

    const pending = store.start('conversation-replace', {
      text: '制作海报',
      attachments: [{ id: 'image-old', name: '旧参考图' }],
    })
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(1))
    store.syncAttachments('conversation-replace', [{ id: 'image-old', name: '旧参考图' }])
    expect(signal?.aborted).toBe(false)
    store.syncAttachments('conversation-replace', [{ id: 'image-new', name: '新参考图' }])
    expect(signal?.aborted).toBe(true)
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2))
    deferred.resolve({ format: 'interview', output: lateReply, rawResponse: '{}' })
    await pending

    await vi.waitFor(() => expect(store.getSnapshot('conversation-replace').running).toBe(false))
    const snapshot = store.getSnapshot('conversation-replace')
    expect(snapshot.running).toBe(false)
    expect(snapshot.project?.phase).toBe('interview')
    expect(snapshot.project?.source.assets).toMatchObject([{ id: 'image-new', label: '新参考图' }])
    expect(snapshot.questions.map((question) => question.field)).toEqual(['subject', 'lighting'])
    expect(JSON.stringify(snapshot.project)).not.toContain(lateReply.message)
  })

  it('从 review 生成 artifact 并建立模型版本', async () => {
    const { store, projects } = createReadyHarness()

    await store.start('conversation-4', { text: '制作香水海报', attachments: [] })
    expect(store.getSnapshot('conversation-4').project?.phase).toBe('review')

    await store.generate('conversation-4')

    const snapshot = store.getSnapshot('conversation-4')
    const saved = getSavedProject(projects, 'conversation-4')
    expect(snapshot.project?.phase).toBe('ready')
    expect(snapshot.editor).toEqual(artifact)
    expect(snapshot.project?.versions).toMatchObject([{
      source: 'model',
      artifact,
    }])
    expect(saved?.activeVersionId).toBe(snapshot.project?.versions[0]?.id)
    expect(saved?.promptStudioUi?.editor).toEqual(artifact)
  })

  it('由项目固定 artifact 领域而不是采用模型别名', async () => {
    const { store } = createHarness(
      async () => ({ format: 'interview', output: createReviewReply(), rawResponse: '{}' }),
      async () => ({
        format: 'artifact',
        output: { ...artifact, domain: 'image_generation' },
        rawResponse: '{}',
      }),
    )

    await store.start('conversation-artifact-domain', { text: '制作香水海报', attachments: [] })
    await store.generate('conversation-artifact-domain')

    expect(store.getSnapshot('conversation-artifact-domain')).toMatchObject({
      project: { phase: 'ready', domain: 'image' },
      editor: { domain: 'image' },
    })
  })

  it('保存手工编辑版本并恢复模型版本', async () => {
    const { store, projects } = createReadyHarness()
    await store.start('conversation-5', { text: '制作香水海报', attachments: [] })
    await store.generate('conversation-5')
    const modelVersionId = store.getSnapshot('conversation-5').project?.versions[0]?.id
    expect(modelVersionId).toBeTruthy()

    const edited = { ...artifact, prompt: '人工编辑后的液态金属香水海报' }
    store.setEditor('conversation-5', edited)
    await store.saveVersion('conversation-5')

    const saved = store.getSnapshot('conversation-5')
    expect(saved.project?.versions.map((version) => version.source)).toEqual(['model', 'user'])
    expect(saved.project?.activeVersionId).toBe(saved.project?.versions[1]?.id)
    expect(saved.editor).toEqual(edited)

    await store.restoreVersion('conversation-5', modelVersionId!)

    const restored = store.getSnapshot('conversation-5')
    const persisted = getSavedProject(projects, 'conversation-5')
    expect(restored.project?.activeVersionId).toBe(modelVersionId)
    expect(restored.editor).toEqual(artifact)
    expect(restored.project?.versions).toHaveLength(2)
    expect(persisted?.activeVersionId).toBe(modelVersionId)
    expect(persisted?.promptStudioUi?.editor).toEqual(artifact)
  })

  it('运行中拒绝恢复版本、处理冲突和再次优化', async () => {
    const response = createDeferred<TextModelResponse>()
    const { store, respond } = createHarness(
      async () => ({ format: 'interview', output: createReviewReply(), rawResponse: '{}' }),
      async () => ({ format: 'artifact', output: artifact, rawResponse: '{}' }),
      () => response.promise,
    )
    await store.start('conversation-running-actions', { text: '制作香水海报', attachments: [] })
    await store.generate('conversation-running-actions')
    store.setEditor('conversation-running-actions', { ...artifact, prompt: '人工版本' })
    await store.saveVersion('conversation-running-actions')
    const modelVersionId = store.getSnapshot('conversation-running-actions').project?.versions[0]?.id

    const pending = store.optimize('conversation-running-actions', '改成冷色光')

    expect(store.getSnapshot('conversation-running-actions').running).toBe(true)
    await expect(store.restoreVersion('conversation-running-actions', modelVersionId!)).rejects.toThrow('AI 正在处理中')
    await expect(store.confirmConflict('conversation-running-actions', 0, true)).rejects.toThrow('AI 正在处理中')
    await expect(store.optimize('conversation-running-actions', '重复优化')).rejects.toThrow('AI 正在处理中')
    expect(store.getSnapshot('conversation-running-actions').editor?.prompt).toBe('人工版本')

    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(3))
    response.resolve({ format: 'artifact', output: { ...artifact, prompt: '冷色优化版本' }, rawResponse: '{}' })
    await pending
    expect(store.getSnapshot('conversation-running-actions').editor?.prompt).toBe('冷色优化版本')
  })

  it('增删参考图会更新来源并通过文本模型重新提问', async () => {
    const { store, respond } = createHarness(
      async () => ({ format: 'interview', output: createReviewReply(), rawResponse: '{}' }),
      async () => ({ format: 'interview', output: createReferenceReply(), rawResponse: '{}' }),
      async () => ({ format: 'interview', output: createReviewReply(), rawResponse: '{}' }),
    )
    await store.start('conversation-assets', { text: '制作香水海报', attachments: [] })
    expect(store.getSnapshot('conversation-assets').project?.phase).toBe('review')

    store.syncAttachments('conversation-assets', [{ id: 'image-1', name: '产品参考图' }])
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(store.getSnapshot('conversation-assets').running).toBe(false))

    const added = store.getSnapshot('conversation-assets')
    expect(added.project?.source.assets).toMatchObject([{ id: 'image-1', label: '产品参考图' }])
    expect(added.project?.brief.fields['reference.hasImages']).toMatchObject({
      value: true,
      status: 'answered',
    })
    expect(added.questions.map((question) => question.field)).toEqual([
      'reference.roles',
      'reference.strength',
    ])

    store.syncAttachments('conversation-assets', [])
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(3))
    await vi.waitFor(() => expect(store.getSnapshot('conversation-assets').running).toBe(false))

    const removed = store.getSnapshot('conversation-assets')
    expect(removed.project?.source.assets).toEqual([])
    expect(removed.project?.brief.fields['reference.hasImages'].value).toBe(false)
    expect(removed.questions).toEqual([])
  })

  it('参考图替换后继续问答且不要求确认冲突', async () => {
    const { store, respond } = createHarness(
      async () => ({ format: 'interview', output: createReviewReply(), rawResponse: '{}' }),
      async () => ({ format: 'interview', output: createReferenceReply(), rawResponse: '{}' }),
      async () => ({ format: 'interview', output: createReferenceReply(), rawResponse: '{}' }),
    )
    await store.start('conversation-conflict', { text: '制作香水海报', attachments: [] })
    store.syncAttachments('conversation-conflict', [{ id: 'image-1', name: '第一张参考图' }])
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(store.getSnapshot('conversation-conflict').running).toBe(false))
    const questions = store.getSnapshot('conversation-conflict').questions
    store.setAnswer('conversation-conflict', questions[0]!.id, { mode: 'answer', value: '商品主体' })
    store.setAnswer('conversation-conflict', questions[1]!.id, { mode: 'answer', value: '高' })
    await store.submitAnswers('conversation-conflict')
    expect(store.getSnapshot('conversation-conflict').project?.phase).toBe('review')

    store.syncAttachments('conversation-conflict', [{ id: 'image-2', name: '第二张参考图' }])
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(3))
    await vi.waitFor(() => expect(store.getSnapshot('conversation-conflict').running).toBe(false))

    const resolved = store.getSnapshot('conversation-conflict')
    expect(resolved.project?.pendingConflicts).toEqual([])
    expect(resolved.project?.phase).toBe('interview')
    expect(resolved.questions.map((question) => question.field)).toEqual([
      'reference.roles',
      'reference.strength',
    ])
    expect(resolved.project?.brief.fields['reference.roles']).toMatchObject({ value: null, status: 'missing' })
  })

  it('dispose 会落盘待保存答案并清空会话快照', async () => {
    vi.useFakeTimers()
    const { store, projects } = createHarness(async () => ({
      format: 'interview',
      output: createInterviewReply(),
      rawResponse: '{}',
    }))
    const answer: PromptQuestionAnswer = { mode: 'answer', value: '香水瓶' }

    await store.start('conversation-6', { text: '制作海报', attachments: [] })
    const projectId = store.getSnapshot('conversation-6').project!.id
    store.setAnswer('conversation-6', 'question-subject', answer)
    expect(projects.get(projectId)?.promptStudioUi?.answers).toEqual({})

    await store.dispose()

    expect(projects.get(projectId)?.promptStudioUi?.answers).toEqual({
      'question-subject': answer,
    })
    expect(store.getSnapshot('conversation-6')).toMatchObject({
      loaded: false,
      running: false,
      project: null,
    })
  })

  it('恢复项目时丢弃损坏的 Prompt Studio UI 字段', async () => {
    const harness = createHarness(async () => ({
      format: 'interview',
      output: createInterviewReply(),
      rawResponse: '{}',
    }))
    await harness.store.start('conversation-invalid-ui', { text: '制作海报', attachments: [] })
    const project = getSavedProject(harness.projects, 'conversation-invalid-ui')!
    await harness.store.dispose()
    harness.projects.set(project.id, {
      ...project,
      promptStudioUi: {
        questions: [null],
        answers: { broken: { mode: 'unknown' } },
        editor: true,
        lastAction: { type: 'optimization', instruction: 1 },
      },
    } as unknown as StoredProject)
    const store = createPromptStudioStore({
      textModel: { respond: vi.fn() },
      storage: harness.storage,
      assets: harness.assets,
      domains: [domain],
    })
    stores.push(store)

    await store.load('conversation-invalid-ui')

    expect(store.getSnapshot('conversation-invalid-ui')).toMatchObject({
      questions: [],
      answers: {},
      editor: null,
    })
  })

  it('持久化当前题和暂停状态，并在改答时清除后续答案', async () => {
    const harness = createHarness(async () => ({
      format: 'interview',
      output: createInterviewReply(),
      rawResponse: '{}',
    }))
    await harness.store.start('conversation-resume', { text: '制作海报', attachments: [] })
    const questions = harness.store.getSnapshot('conversation-resume').questions
    harness.store.setAnswer('conversation-resume', questions[0]!.id, { mode: 'answer', value: '主体 A' })
    harness.store.setCurrentQuestion('conversation-resume', questions[1]!.id)
    harness.store.setAnswer('conversation-resume', questions[1]!.id, { mode: 'answer', value: '光线 A' })
    harness.store.setCurrentQuestion('conversation-resume', questions[0]!.id)
    harness.store.setAnswer('conversation-resume', questions[0]!.id, { mode: 'answer', value: '主体 B' })

    expect(harness.store.getSnapshot('conversation-resume').answers).toEqual({
      [questions[0]!.id]: { mode: 'answer', value: '主体 B' },
    })
    expect(harness.store.pause('conversation-resume')).toBe(true)
    await harness.store.dispose()

    const store = createPromptStudioStore({
      textModel: { respond: vi.fn() },
      storage: harness.storage,
      assets: harness.assets,
      domains: [domain],
    })
    stores.push(store)
    await store.load('conversation-resume')

    expect(store.getSnapshot('conversation-resume')).toMatchObject({
      currentQuestionId: questions[0]!.id,
      paused: true,
    })
    expect(store.resume('conversation-resume')).toBe(true)
    expect(store.getSnapshot('conversation-resume').paused).toBe(false)
  })

  it('加载旧本地问题时清空问题并要求通过文本模型重试', async () => {
    const harness = createHarness(async () => ({
      format: 'interview',
      output: createInterviewReply(),
      rawResponse: '{}',
    }))
    await harness.store.start('conversation-legacy-local', { text: '制作海报', attachments: [] })
    await harness.store.dispose()
    const saved = getSavedProject(harness.projects, 'conversation-legacy-local')!
    harness.projects.set(saved.id, {
      ...saved,
      phase: 'interview',
      promptStudioUi: {
        questions: [{
          id: 'reference-role-question-old',
          field: 'reference.roles',
          text: '这些参考图分别承担什么用途？',
          input: 'text',
          options: [],
          required: true,
        }],
        answers: {},
      },
    })
    const respond = vi.fn(async () => ({
      format: 'interview' as const,
      output: createInterviewReply(),
      rawResponse: '{}',
    }))
    const store = createPromptStudioStore({
      textModel: { respond },
      storage: harness.storage,
      assets: harness.assets,
      domains: [domain],
    })
    stores.push(store)

    await store.load('conversation-legacy-local')
    expect(store.getSnapshot('conversation-legacy-local')).toMatchObject({
      questions: [],
      error: '历史问题来源无法确认，请通过文本模型重新生成。',
      project: { phase: 'error' },
    })
    expect(respond).not.toHaveBeenCalled()

    await store.retry('conversation-legacy-local')
    expect(respond).toHaveBeenCalledOnce()
    expect(store.getSnapshot('conversation-legacy-local').questions).toEqual(createInterviewReply().questions)
  })
})

function createHarness(...handlers: Respond[]) {
  const queue = [...handlers]
  const projects = new Map<string, StoredProject>()
  const put = vi.fn(async (project: PromptProject) => {
    projects.set(project.id, structuredClone(project) as StoredProject)
  })
  const storage: PromptStudioStorage = {
    list: async () => Array.from(projects.values()),
    get: async (id) => projects.get(id) ?? null,
    getByConversationId: async (conversationId) => (
      Array.from(projects.values()).find((project) => project.conversationId === conversationId) ?? null
    ),
    put,
    delete: async (id) => {
      projects.delete(id)
    },
  }
  const assets: PromptStudioAssets = {
    save: async (asset) => ({
      id: asset.id,
      type: 'image',
      label: asset.label,
      role: asset.role,
    }),
    resolve: async () => null,
    deleteIfUnused: async () => {},
  }
  const respond = vi.fn((input: TextModelRequest, signal: AbortSignal) => {
    const handler = queue.shift()
    if (!handler) return Promise.reject(new Error('未配置模型响应'))
    return handler(input, signal)
  })
  const onError = vi.fn()
  const store = createPromptStudioStore({
    textModel: { respond },
    storage,
    assets,
    domains: [domain],
    onError,
  })
  stores.push(store)
  return { store, projects, put, respond, onError, storage, assets }
}

function createReadyHarness() {
  return createHarness(
    async () => ({
      format: 'interview',
      output: createReviewReply(),
      rawResponse: '{}',
    }),
    async () => ({
      format: 'artifact',
      output: artifact,
      rawResponse: '{}',
    }),
  )
}

function createInterviewReply(): PromptInterviewReply {
  return {
    phase: 'interview',
    message: '还需要补充主体和光线',
    briefPatch: [modelAnswer('goal', '宣传海报')],
    questions: [question('subject'), question('lighting')],
  }
}

function createReviewReply(): PromptInterviewReply {
  return {
    phase: 'review',
    message: '需求已完整，请确认',
    briefPatch: [
      modelAnswer('goal', '宣传海报'),
      modelAnswer('subject', '透明玻璃香水瓶'),
      modelAnswer('lighting', '柔和侧光'),
    ],
    questions: [],
  }
}

function createReferenceReply(): PromptInterviewReply {
  return {
    phase: 'interview',
    message: '需要确认参考图的用途和保留强度',
    briefPatch: [],
    questions: [question('reference.roles'), question('reference.strength')],
  }
}

function modelAnswer(field: string, value: string) {
  return {
    field,
    value,
    status: 'answered' as const,
    origin: 'model' as const,
    locked: false,
  }
}

function question(field: string): PromptQuestion {
  return {
    id: `question-${field}`,
    field,
    text: `${field} 是什么？`,
    input: 'single',
    options: [
      { label: '推荐方案 A', value: `${field}-a` },
      { label: '推荐方案 B', value: `${field}-b` },
    ],
    required: true,
  }
}

function getSavedProject(projects: Map<string, StoredProject>, conversationId: string) {
  return Array.from(projects.values()).find((project) => project.conversationId === conversationId)
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
