import {
  applyPromptInterviewReply,
  applyPromptProjectPatch,
  confirmPromptProjectConflict,
  createPromptProject,
  finishPromptGeneration,
  saveManualPromptVersion,
  startPromptGeneration,
  startPromptOptimization,
} from '../core/session'
import { getActivePromptVersion, restorePromptVersion } from '../core/versions'
import type {
  PromptArtifact,
  PromptBriefPatchEntry,
  PromptDomainDefinition,
  PromptInterviewReply,
  PromptProject,
  PromptQuestion,
  PromptScalar,
  PromptValue,
} from '../types'
import type { PromptStudioAssets } from '../ports/assets'
import type { PromptStudioStorage } from '../ports/storage'
import { TextModelResponseError, type TextModelPort } from '../ports/textModel'
import { createPromptProjectPersistence, type PromptProjectRequestToken } from './persistence'

export type PromptQuestionAnswer = {
  mode: 'answer' | 'delegated' | 'not-applicable'
  value?: PromptValue
}

type PromptRequestAction =
  | { type: 'interview'; input: string; phase: 'extracting' | 'interview' }
  | { type: 'artifact' }
  | { type: 'optimization'; instruction: string; prompt: string }

type PromptProjectUi = {
  questions: PromptQuestion[]
  questionSource?: 'http'
  answers: Record<string, PromptQuestionAnswer>
  currentQuestionId?: string
  paused: boolean
  editor?: PromptArtifact
  error?: string
  rawResponse?: string
  lastAction?: PromptRequestAction
}

type StoredPromptProject = PromptProject & {
  promptStudioUi?: PromptProjectUi
}

export type PromptStudioSessionSnapshot = {
  conversationId: string
  loading: boolean
  loaded: boolean
  running: boolean
  project: StoredPromptProject | null
  questions: PromptQuestion[]
  answers: Record<string, PromptQuestionAnswer>
  currentQuestionId: string | null
  paused: boolean
  editor: PromptArtifact | null
  error: string | null
  rawResponse: string | null
}

export type PromptStudioStoreOptions = {
  textModel: TextModelPort
  storage: PromptStudioStorage
  assets: PromptStudioAssets
  domains: readonly PromptDomainDefinition[]
  onError?: (err: unknown) => void
}

export type PromptStudioStartInput = {
  text: string
  attachments: readonly { id: string; name?: string }[]
  outputSettings?: Record<string, PromptScalar | null>
}

export type PromptStudioStore = ReturnType<typeof createPromptStudioStore>

const emptyUi = (): PromptProjectUi => ({ questions: [], answers: {}, paused: false })
const REQUEST_RUNNING_MESSAGE = 'AI 正在处理中，请先停止当前请求'
const LEGACY_LOCAL_QUESTION_PREFIXES = [
  'reference-role-question-',
  'reference-strength-question-',
  'conflict-question-',
]

let nextId = 0

function createId(prefix: string) {
  nextId += 1
  return `${prefix}-${Date.now()}-${nextId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPromptScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isPromptValue(value: unknown): value is PromptValue {
  return value === null || isPromptScalar(value) || Array.isArray(value) && value.every(isPromptScalar)
}

function isPromptQuestion(value: unknown): value is PromptQuestion {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && typeof value.field === 'string'
    && typeof value.text === 'string'
    && (value.input === 'single' || value.input === 'multiple' || value.input === 'text' || value.input === 'number')
    && Array.isArray(value.options)
    && value.options.every((option) => isRecord(option) && typeof option.label === 'string' && isPromptScalar(option.value))
    && typeof value.required === 'boolean'
}

function isPromptAnswer(value: unknown): value is PromptQuestionAnswer {
  if (!isRecord(value)) return false
  if (value.mode !== 'answer' && value.mode !== 'delegated' && value.mode !== 'not-applicable') return false
  return value.value === undefined || isPromptValue(value.value)
}

function isPromptArtifact(value: unknown): value is PromptArtifact {
  if (!isRecord(value) || typeof value.domain !== 'string' || typeof value.title !== 'string' || typeof value.prompt !== 'string') return false
  if (value.negativePrompt !== undefined && typeof value.negativePrompt !== 'string') return false
  if (!isRecord(value.params) || !Object.values(value.params).every(isPromptScalar)) return false
  if (value.shotList === undefined) return true
  return Array.isArray(value.shotList) && value.shotList.every((shot) => (
    isRecord(shot)
    && typeof shot.index === 'number'
    && (shot.duration === undefined || typeof shot.duration === 'number')
    && typeof shot.prompt === 'string'
    && (shot.audio === undefined || typeof shot.audio === 'string')
  ))
}

function isPromptRequestAction(value: unknown): value is PromptRequestAction {
  if (!isRecord(value)) return false
  if (value.type === 'artifact') return true
  if (value.type === 'interview') {
    return typeof value.input === 'string' && (value.phase === 'extracting' || value.phase === 'interview')
  }
  return value.type === 'optimization'
    && typeof value.instruction === 'string'
    && typeof value.prompt === 'string'
}

function hasUnverifiedQuestions(project: StoredPromptProject) {
  const ui = isRecord(project.promptStudioUi) ? project.promptStudioUi : null
  if (!Array.isArray(ui?.questions) || !ui.questions.length) return false
  if (ui.questionSource !== 'http') return true
  return ui.questions.some((question) => (
    isRecord(question) && typeof question.id === 'string'
      && LEGACY_LOCAL_QUESTION_PREFIXES.some((prefix) => question.id.startsWith(prefix))
  ))
}

function getUi(project: StoredPromptProject): PromptProjectUi {
  const ui = isRecord(project.promptStudioUi) ? project.promptStudioUi : null
  const questions = Array.isArray(ui?.questions) && ui.questions.every(isPromptQuestion) ? ui.questions : []
  const answers = isRecord(ui?.answers) && Object.values(ui.answers).every(isPromptAnswer)
    ? ui.answers as Record<string, PromptQuestionAnswer>
    : {}
  const currentQuestionId = typeof ui?.currentQuestionId === 'string'
    && questions.some((question) => question.id === ui.currentQuestionId)
    ? ui.currentQuestionId
    : questions.find((question) => !answers[question.id])?.id ?? questions[0]?.id
  return {
    questions,
    ...(ui?.questionSource === 'http' ? { questionSource: 'http' as const } : {}),
    answers,
    ...(currentQuestionId ? { currentQuestionId } : {}),
    paused: ui?.paused === true,
    ...(isPromptArtifact(ui?.editor) ? { editor: ui.editor } : {}),
    ...(typeof ui?.error === 'string' && ui.error ? { error: ui.error } : {}),
    ...(typeof ui?.rawResponse === 'string' && ui.rawResponse ? { rawResponse: ui.rawResponse } : {}),
    ...(isPromptRequestAction(ui?.lastAction) ? { lastAction: ui.lastAction } : {}),
  }
}

function withUi(project: PromptProject, changes: Partial<PromptProjectUi>): StoredPromptProject {
  const current = getUi(project as StoredPromptProject)
  const ui = { ...current, ...changes }
  return { ...project, promptStudioUi: ui }
}

function getOutputSettingsPatch(outputSettings: PromptStudioStartInput['outputSettings']): PromptBriefPatchEntry[] {
  if (!outputSettings) return []
  return [
    ['aspectRatio', outputSettings.aspectRatio],
    ['size', outputSettings.size && outputSettings.size !== 'auto' ? outputSettings.size : undefined],
    ['quality', outputSettings.quality && outputSettings.quality !== 'auto' ? outputSettings.quality : undefined],
  ].flatMap(([field, value]) => typeof value === 'string' && value.trim()
    ? [{
        field: `output.${field}`,
        value,
        status: 'answered' as const,
        origin: 'source' as const,
        locked: true,
      }]
    : [])
}

function getLockedOutputFields(brief: PromptProject['brief']) {
  return new Set(Object.entries(brief.fields)
    .filter(([field, value]) => field.startsWith('output.') && value.origin === 'source' && value.locked)
    .map(([field]) => field))
}

function sanitizeInterviewReply(reply: PromptInterviewReply, brief: PromptProject['brief']): PromptInterviewReply {
  const lockedFields = getLockedOutputFields(brief)
  const outputFields = new Set(['output.aspectRatio', 'output.size', 'output.quality'])
  const blockedFields = new Set([...lockedFields, ...outputFields])
  return {
    ...reply,
    briefPatch: reply.briefPatch.filter((patch) => !lockedFields.has(patch.field)),
    questions: reply.questions.filter((question) => !blockedFields.has(question.field)),
  }
}

function applyOutputSettings(artifact: PromptArtifact, project: PromptProject): PromptArtifact {
  const metadata = project.source.metadata ?? {}
  const params = { ...artifact.params }
  const keys = ['size', 'quality', 'output_format', 'output_compression', 'moderation', 'n', 'transparent_output']
  keys.forEach((key) => {
    const value = metadata[`output.${key}`]
    if (value === undefined) return
    params[key] = value
  })
  return { ...artifact, params }
}

function cloneArtifact(artifact: PromptArtifact): PromptArtifact {
  return {
    ...artifact,
    params: { ...artifact.params },
    shotList: artifact.shotList?.map((shot) => ({ ...shot })),
  }
}

function createSnapshot(
  conversationId: string,
  changes: Partial<PromptStudioSessionSnapshot> = {},
): PromptStudioSessionSnapshot {
  const project = changes.project ?? null
  const ui = project ? getUi(project) : emptyUi()
  return {
    conversationId,
    loading: false,
    loaded: false,
    running: false,
    project,
    questions: ui.questions,
    answers: ui.answers,
    currentQuestionId: ui.currentQuestionId ?? null,
    paused: ui.paused,
    editor: ui.editor ?? null,
    error: ui.error ?? null,
    rawResponse: ui.rawResponse ?? null,
    ...changes,
  }
}

function getDomain(project: PromptProject, domains: readonly PromptDomainDefinition[]) {
  const domain = domains.find((item) => item.id === project.domain)
  if (!domain) throw new Error(`提示词领域未注册: ${project.domain}`)
  return domain
}

function getQuestionValue(answer: PromptQuestionAnswer) {
  if (answer.mode === 'delegated' || answer.mode === 'not-applicable') return null
  return answer.value ?? null
}

function getAnswerPatch(
  questions: readonly PromptQuestion[],
  answers: Record<string, PromptQuestionAnswer>,
): PromptBriefPatchEntry[] {
  return questions.flatMap((question) => {
    const answer = answers[question.id]
    if (!answer || answer.mode === 'delegated') return []
    return [{
      field: question.field,
      value: getQuestionValue(answer),
      status: answer.mode === 'answer' ? 'answered' as const : answer.mode,
      origin: 'user' as const,
      locked: true,
    }]
  })
}

function getAnswerText(
  questions: readonly PromptQuestion[],
  answers: Record<string, PromptQuestionAnswer>,
) {
  return questions.flatMap((question) => {
    const answer = answers[question.id]
    if (!answer) return []
    const value = answer.mode === 'delegated'
      ? '请 AI 给出具体建议'
      : answer.mode === 'not-applicable'
        ? '不适用'
        : Array.isArray(answer.value)
          ? answer.value.join('、')
          : String(answer.value ?? '')
    return [`${question.text}：${value}`]
  }).join('\n')
}

function getImages(project: PromptProject) {
  return project.source.assets?.map((asset) => ({ id: asset.id, label: asset.label })) ?? []
}

function buildInterviewInput(project: PromptProject, input: string) {
  const outputSettings = Object.fromEntries(
    Object.entries(project.source.metadata ?? {})
      .filter(([key]) => key.startsWith('output.'))
      .map(([key, value]) => [key.slice('output.'.length), value]),
  )
  return JSON.stringify({
    source: project.source,
    outputSettings,
    brief: project.brief.fields,
    recentMessages: project.messages.slice(-12),
    userInput: input,
  }, null, 2)
}

function buildArtifactInput(project: PromptProject) {
  return JSON.stringify({
    source: project.source,
    brief: project.brief.fields,
    recentMessages: project.messages.slice(-8),
  }, null, 2)
}

function getErrorDetails(err: unknown) {
  if (err instanceof TextModelResponseError) {
    return { message: err.message, rawResponse: err.rawResponse }
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { message: '请求已停止，可继续编辑后重试', rawResponse: '' }
  }
  return { message: err instanceof Error ? err.message : String(err), rawResponse: '' }
}

export function createPromptStudioStore(opts: PromptStudioStoreOptions) {
  const sessions = new Map<string, PromptStudioSessionSnapshot>()
  const listeners = new Map<string, Set<() => void>>()
  const loads = new Map<string, Promise<void>>()
  const requests = new Map<string, { id: string; controller: AbortController }>()
  const persistence = createPromptProjectPersistence(opts.storage, { onError: opts.onError })

  const getSnapshot = (conversationId: string) => {
    const current = sessions.get(conversationId)
    if (current) return current
    const snapshot = createSnapshot(conversationId)
    sessions.set(conversationId, snapshot)
    return snapshot
  }

  const emit = (conversationId: string) => {
    listeners.get(conversationId)?.forEach((listener) => listener())
  }

  const setSnapshot = (
    conversationId: string,
    changes: Partial<PromptStudioSessionSnapshot>,
  ) => {
    const current = getSnapshot(conversationId)
    const project = changes.project === undefined ? current.project : changes.project
    const ui = project ? getUi(project) : emptyUi()
    sessions.set(conversationId, {
      ...current,
      ...changes,
      project,
      questions: changes.questions ?? ui.questions,
      answers: changes.answers ?? ui.answers,
      currentQuestionId: changes.currentQuestionId === undefined ? ui.currentQuestionId ?? null : changes.currentQuestionId,
      paused: changes.paused ?? ui.paused,
      editor: changes.editor === undefined ? ui.editor ?? null : changes.editor,
      error: changes.error === undefined ? ui.error ?? null : changes.error,
      rawResponse: changes.rawResponse === undefined ? ui.rawResponse ?? null : changes.rawResponse,
    })
    emit(conversationId)
  }

  const saveProject = (
    conversationId: string,
    project: StoredPromptProject,
    immediate = false,
    token?: PromptProjectRequestToken,
  ) => {
    setSnapshot(conversationId, { project })
    if (immediate) return persistence.save(project, token).then(() => undefined)
    persistence.schedule(project)
    return Promise.resolve()
  }

  const getIdleSnapshot = (conversationId: string) => {
    const snapshot = getSnapshot(conversationId)
    if (snapshot.running) throw new Error(REQUEST_RUNNING_MESSAGE)
    return snapshot
  }

  const load = (conversationId: string) => {
    const current = getSnapshot(conversationId)
    if (current.loaded) return Promise.resolve()
    const pending = loads.get(conversationId)
    if (pending) return pending

    setSnapshot(conversationId, { loading: true })
    const promise = opts.storage.getByConversationId(conversationId)
      .then((project) => {
        const stored = project as StoredPromptProject | null
        const migrated = stored && hasUnverifiedQuestions(stored)
          ? withUi({ ...stored, phase: 'error', updatedAt: Date.now() }, {
              questions: [],
              questionSource: undefined,
              answers: {},
              currentQuestionId: undefined,
              paused: false,
              error: '历史问题来源无法确认，请通过文本模型重新生成。',
              rawResponse: undefined,
              lastAction: {
                type: 'interview',
                input: '请根据当前文本和参考图重新生成问答。',
                phase: 'interview',
              },
            })
          : stored
        const conflictFree = migrated && migrated.pendingConflicts.length
          ? { ...migrated, pendingConflicts: [] }
          : migrated
        const active = conflictFree ? getActivePromptVersion(conflictFree) : undefined
        const next = conflictFree && active && !getUi(conflictFree).editor
          ? withUi(conflictFree, { editor: cloneArtifact(active.artifact) })
          : conflictFree
        setSnapshot(conversationId, {
          loading: false,
          loaded: true,
          project: next,
        })
        if (next !== stored && next) persistence.schedule(next)
      })
      .catch((err) => {
        opts.onError?.(err)
        setSnapshot(conversationId, {
          loading: false,
          loaded: false,
          error: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => loads.delete(conversationId))
    loads.set(conversationId, promise)
    return promise
  }

  const startRequest = (
    conversationId: string,
    project: StoredPromptProject,
    externalSignal?: AbortSignal,
  ) => {
    requests.get(conversationId)?.controller.abort(new DOMException('请求已替换', 'AbortError'))
    const id = createId('prompt-request')
    const controller = new AbortController()
    const abort = () => controller.abort(externalSignal?.reason ?? new DOMException('请求已停止', 'AbortError'))
    if (externalSignal?.aborted) abort()
    else externalSignal?.addEventListener('abort', abort, { once: true })
    requests.set(conversationId, { id, controller })
    const token = persistence.startRequest(project.id, id)
    setSnapshot(conversationId, { running: true, error: null, rawResponse: null })
    return {
      id,
      signal: controller.signal,
      token,
      current: () => requests.get(conversationId)?.id === id && !controller.signal.aborted,
      finish: () => {
        externalSignal?.removeEventListener('abort', abort)
        if (requests.get(conversationId)?.id === id) requests.delete(conversationId)
      },
    }
  }

  const failRequest = async (
    conversationId: string,
    project: StoredPromptProject,
    err: unknown,
    requestId: string,
  ) => {
    const details = getErrorDetails(err)
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      console.error('提示词工作台请求失败', err)
      opts.onError?.(err)
    }
    persistence.invalidateRequest(project.id)
    const failed = withUi({ ...project, phase: 'error', updatedAt: Date.now() }, {
      error: details.message,
      rawResponse: details.rawResponse,
    })
    await persistence.save(failed)
    if (requests.get(conversationId)?.id !== requestId) return
    setSnapshot(conversationId, {
      running: false,
      project: failed,
      error: details.message,
      rawResponse: details.rawResponse || null,
    })
  }

  const runInterview = async (
    conversationId: string,
    project: StoredPromptProject,
    action: Extract<PromptRequestAction, { type: 'interview' }>,
    externalSignal?: AbortSignal,
  ) => {
    const domain = getDomain(project, opts.domains)
    const ready = withUi({ ...project, phase: action.phase }, {
      lastAction: action,
      error: undefined,
      rawResponse: undefined,
    })
    const request = startRequest(conversationId, ready, externalSignal)

    try {
      await saveProject(conversationId, ready, true, request.token)
      if (!request.current() || !persistence.isCurrentRequest(request.token)) return
      const response = await opts.textModel.respond({
        format: 'interview',
        instructions: domain.buildInstructions(ready.brief),
        input: buildInterviewInput(ready, action.input),
        images: getImages(ready),
      }, request.signal)
      if (!request.current() || !persistence.isCurrentRequest(request.token)) return
      if (response.format !== 'interview') throw new Error('提示词访谈返回了错误的响应类型')
      const reply = sanitizeInterviewReply(response.output, ready.brief)
      const result = applyPromptInterviewReply(ready, reply, domain)
      const next = withUi(result.project, {
        questions: reply.questions,
        questionSource: 'http',
        answers: {},
        currentQuestionId: response.output.questions[0]?.id,
        paused: false,
        error: undefined,
        rawResponse: undefined,
        lastAction: undefined,
      })
      await persistence.save(next, request.token)
      if (!request.current()) return
      setSnapshot(conversationId, { project: next, running: false })
    } catch (err) {
      if (requests.get(conversationId)?.id !== request.id) return
      if (request.signal.aborted && getSnapshot(conversationId).project?.phase === 'error') return
      await failRequest(conversationId, ready, err, request.id)
    } finally {
      const current = requests.get(conversationId)?.id === request.id
      if (current && request.signal.aborted && getSnapshot(conversationId).project?.phase !== 'error') {
        await failRequest(conversationId, ready, request.signal.reason, request.id)
      }
      request.finish()
      if (current) setSnapshot(conversationId, { running: false })
    }
  }

  const runArtifact = async (
    conversationId: string,
    project: StoredPromptProject,
    action: Extract<PromptRequestAction, { type: 'artifact' | 'optimization' }>,
    externalSignal?: AbortSignal,
  ) => {
    const domain = getDomain(project, opts.domains)
    const started = action.type === 'optimization'
      ? startPromptOptimization({ ...project, phase: 'ready' }, action.prompt, action.instruction).project
      : startPromptGeneration({ ...project, phase: 'review' }, domain)
    const ready = withUi(started, {
      lastAction: action,
      paused: false,
      error: undefined,
      rawResponse: undefined,
    })
    const request = startRequest(conversationId, ready, externalSignal)

    try {
      await saveProject(conversationId, ready, true, request.token)
      if (!request.current() || !persistence.isCurrentRequest(request.token)) return
      const input = action.type === 'optimization'
        ? JSON.stringify({
            context: startPromptOptimization({ ...project, phase: 'ready' }, action.prompt, action.instruction).context,
            recentMessages: project.messages.slice(-8),
          }, null, 2)
        : buildArtifactInput(ready)
      const response = await opts.textModel.respond({
        format: 'artifact',
        instructions: domain.buildArtifactInstructions(ready.brief),
        input,
        images: getImages(ready),
      }, request.signal)
      if (!request.current() || !persistence.isCurrentRequest(request.token)) return
      if (response.format !== 'artifact') throw new Error('提示词生成返回了错误的响应类型')
      const artifact = applyOutputSettings({ ...response.output, domain: ready.domain }, ready)
      const result = finishPromptGeneration(ready, artifact, domain, {
        ...(action.type === 'optimization' ? { instruction: action.instruction } : {}),
      })
      const next = withUi(result, {
        editor: cloneArtifact(artifact),
        paused: false,
        error: undefined,
        rawResponse: undefined,
        lastAction: undefined,
      })
      await persistence.save(next, request.token)
      if (!request.current()) return
      setSnapshot(conversationId, { project: next, running: false })
    } catch (err) {
      if (requests.get(conversationId)?.id !== request.id) return
      if (request.signal.aborted && getSnapshot(conversationId).project?.phase === 'error') return
      await failRequest(conversationId, ready, err, request.id)
    } finally {
      const current = requests.get(conversationId)?.id === request.id
      if (current && request.signal.aborted && getSnapshot(conversationId).project?.phase !== 'error') {
        await failRequest(conversationId, ready, request.signal.reason, request.id)
      }
      request.finish()
      if (current) setSnapshot(conversationId, { running: false })
    }
  }

  const start = async (
    conversationId: string,
    input: PromptStudioStartInput,
    externalSignal?: AbortSignal,
  ) => {
    await load(conversationId)
    const current = getIdleSnapshot(conversationId)
    const text = input.text.trim()
    const projectId = createId('prompt-project')
    const sourceText = text || (input.attachments.length ? '请分析参考图片并确认创作需求' : '')
    const project = createPromptProject({
      id: projectId,
      conversationId,
      title: text.slice(0, 36) || '未命名图片提示词',
      source: {
        type: 'text',
        text: sourceText,
        assets: input.attachments.map((item, index) => ({
          id: item.id,
          type: 'image' as const,
          label: item.name?.trim() || `参考图${index + 1}`,
          role: 'unknown' as const,
        })),
        metadata: Object.fromEntries(Object.entries(input.outputSettings ?? {})
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => [`output.${key}`, value as PromptScalar])),
      },
      domain: opts.domains[0],
    })
    const message = {
      id: createId('prompt-message'),
      role: 'user' as const,
      content: sourceText,
      createdAt: Date.now(),
    }
    const outputPatch = getOutputSettingsPatch(input.outputSettings)
    const seeded = outputPatch.length
      ? applyPromptProjectPatch({ ...project, phase: 'interview' }, outputPatch, opts.domains[0]).project
      : project
    const next = withUi({ ...seeded, messages: [message] }, emptyUi())
    if (current.project) persistence.invalidateRequest(current.project.id)
    await runInterview(conversationId, next, { type: 'interview', input: sourceText, phase: 'extracting' }, externalSignal)
  }

  const submit = async (
    conversationId: string,
    input: PromptStudioStartInput,
    externalSignal?: AbortSignal,
  ) => {
    await load(conversationId)
    const snapshot = getIdleSnapshot(conversationId)
    if (!snapshot.project) return start(conversationId, input, externalSignal)
    const project = snapshot.project
    const text = input.text.trim()
    if (project.phase === 'ready') {
      const editor = getUi(project).editor ?? getActivePromptVersion(project)?.artifact
      if (!editor) throw new Error('当前没有可继续优化的提示词版本')
      return runArtifact(conversationId, project, {
        type: 'optimization',
        instruction: text,
        prompt: editor.prompt,
      }, externalSignal)
    }

    const phase = project.phase === 'extracting' ? 'extracting' : 'interview'
    const message = {
      id: createId('prompt-message'),
      role: 'user' as const,
      content: text,
      createdAt: Date.now(),
    }
    const next = withUi({ ...project, phase, messages: [...project.messages, message] }, {
      lastAction: { type: 'interview', input: text, phase },
    })
    return runInterview(conversationId, next, { type: 'interview', input: text, phase }, externalSignal)
  }

  const setAnswer = (
    conversationId: string,
    questionId: string,
    answer: PromptQuestionAnswer | null,
  ) => {
    const snapshot = getSnapshot(conversationId)
    if (!snapshot.project || snapshot.running) return
    const answers = { ...snapshot.answers }
    const index = snapshot.questions.findIndex((question) => question.id === questionId)
    const previous = answers[questionId]
    if (index >= 0 && previous && JSON.stringify(previous) !== JSON.stringify(answer)) {
      snapshot.questions.slice(index + 1).forEach((question) => delete answers[question.id])
    }
    if (answer) answers[questionId] = answer
    else delete answers[questionId]
    const project = withUi(snapshot.project, { answers, paused: false })
    void saveProject(conversationId, project)
  }

  const setCurrentQuestion = (conversationId: string, questionId: string) => {
    const snapshot = getSnapshot(conversationId)
    if (!snapshot.project || snapshot.running) return
    if (!snapshot.questions.some((question) => question.id === questionId)) return
    void saveProject(conversationId, withUi(snapshot.project, {
      currentQuestionId: questionId,
      paused: false,
    }))
  }

  const syncOutputSettings = (
    conversationId: string,
    outputSettings: PromptStudioStartInput['outputSettings'],
  ) => {
    const snapshot = getSnapshot(conversationId)
    const project = snapshot.project
    if (!project || snapshot.running) return
    const metadata = { ...(project.source.metadata ?? {}) }
    Object.entries(outputSettings ?? {}).forEach(([key, value]) => {
      if (value == null) delete metadata[`output.${key}`]
      else metadata[`output.${key}`] = value
    })
    const fields = { ...project.brief.fields }
    Object.keys(fields).filter((field) => field.startsWith('output.')).forEach((field) => {
      fields[field] = {
        value: null,
        status: 'missing',
        origin: 'model',
        locked: false,
        updatedAt: Date.now(),
      }
    })
    const base = {
      ...project,
      phase: project.phase === 'error' ? 'interview' as const : project.phase,
      brief: { ...project.brief, fields },
      source: { ...project.source, metadata },
    }
    const result = applyPromptProjectPatch(base, getOutputSettingsPatch(outputSettings), getDomain(base, opts.domains))
    const questions = snapshot.questions.filter((question) => !question.field.startsWith('output.'))
    const answers = Object.fromEntries(Object.entries(snapshot.answers).filter(([questionId]) => (
      questions.some((question) => question.id === questionId)
    )))
    const next = withUi(result.project, {
      questions,
      answers,
      currentQuestionId: questions.find((question) => !answers[question.id])?.id,
      error: undefined,
      rawResponse: undefined,
    })
    void saveProject(conversationId, next)
  }

  const syncAttachments = (
    conversationId: string,
    attachments: readonly { id: string; name?: string }[],
  ) => {
    const snapshot = getSnapshot(conversationId)
    const currentIds = snapshot.project?.source.assets?.map((asset) => asset.id).join('\0') ?? ''
    const nextIds = attachments.map((item) => item.id).join('\0')
    if (!snapshot.project || currentIds === nextIds) return
    const activeRequest = requests.get(conversationId)
    if (activeRequest) {
      activeRequest.controller.abort(new DOMException('参考图已更新', 'AbortError'))
      requests.delete(conversationId)
      if (snapshot.project) persistence.invalidateRequest(snapshot.project.id)
      setSnapshot(conversationId, { running: false })
    }
    const project = getSnapshot(conversationId).project
    if (!project) return
    const source = {
      ...project.source,
      assets: attachments.map((item, index) => ({
        id: item.id,
        type: 'image' as const,
        label: item.name?.trim() || `参考图${index + 1}`,
        role: 'unknown' as const,
      })),
    }
    const base = project.phase === 'interview' || project.phase === 'review' || project.phase === 'ready'
      ? project
      : { ...project, phase: 'interview' as const }
    const hasImages = attachments.length > 0
    const patch: PromptBriefPatchEntry[] = [{
      field: 'reference.hasImages',
      value: hasImages,
      status: 'answered',
      origin: 'source',
      locked: false,
    }]
    if (currentIds && nextIds) {
      patch.push(
        { field: 'reference.roles', value: null, status: 'missing', origin: 'source', locked: false },
        { field: 'reference.strength', value: null, status: 'missing', origin: 'source', locked: false },
      )
    }
    const result = applyPromptProjectPatch({ ...base, source }, patch, getDomain(base, opts.domains))
    const input = hasImages
      ? '参考图已更新，请重新分析图片并继续确认创作需求。'
      : '参考图已移除，请根据当前素材继续确认创作需求。'
    const next = withUi({ ...result.project, phase: 'interview' }, {
      questions: [],
      questionSource: undefined,
      answers: {},
      currentQuestionId: undefined,
      error: undefined,
      rawResponse: undefined,
      lastAction: { type: 'interview', input, phase: 'interview' },
    })
    if (next.pendingConflicts.length) {
      void saveProject(conversationId, next)
      return
    }
    void runInterview(conversationId, next, { type: 'interview', input, phase: 'interview' })
  }

  const confirmConflict = async (conversationId: string, index: number, accept: boolean) => {
    const project = getIdleSnapshot(conversationId).project
    const conflict = project?.pendingConflicts[index]
    if (!project || !conflict) return
    if (project.phase !== 'interview') throw new Error(`当前阶段不能处理字段冲突: ${project.phase}`)
    const domain = getDomain(project, opts.domains)
    const next = accept
      ? confirmPromptProjectConflict({ ...project, phase: 'interview' }, conflict, domain).project
      : applyPromptProjectPatch({
          ...project,
          phase: 'interview',
          pendingConflicts: project.pendingConflicts.filter((_, itemIndex) => itemIndex !== index),
          updatedAt: Date.now(),
        }, [], domain).project
    const ui = getUi(project)
    const saved = withUi(next, {
      questions: ui.questions,
      currentQuestionId: ui.questions[0]?.id,
    })
    await saveProject(conversationId, saved, true)
    if (!saved.pendingConflicts.length && saved.phase === 'interview' && !ui.questions.length) {
      await runInterview(conversationId, saved, {
        type: 'interview',
        input: '冲突已确认，请根据当前需求继续生成下一批问题。',
        phase: 'interview',
      })
    }
  }

  const submitAnswers = async (conversationId: string) => {
    const snapshot = getIdleSnapshot(conversationId)
    const project = snapshot.project
    if (!project || !snapshot.questions.length) return
    if (project.phase !== 'interview' && project.phase !== 'error') {
      throw new Error(`当前阶段不能提交问题答案: ${project.phase}`)
    }
    const patch = getAnswerPatch(snapshot.questions, snapshot.answers)
    const delegated = Object.values(snapshot.answers).some((answer) => answer.mode === 'delegated')
    if (!patch.length && !delegated) throw new Error('请至少回答一个问题')
    const text = getAnswerText(snapshot.questions, snapshot.answers)
    const base = project.phase === 'error' ? { ...project, phase: 'interview' as const } : project
    const message = {
      id: createId('prompt-message'),
      role: 'user' as const,
      content: text,
      createdAt: Date.now(),
    }
    const result = applyPromptProjectPatch({
      ...base,
      messages: [...base.messages, message],
    }, patch, getDomain(base, opts.domains))
    const next = withUi(result.project, {
      questions: snapshot.questions,
      answers: snapshot.answers,
      lastAction: { type: 'interview', input: text, phase: 'interview' },
      error: undefined,
      rawResponse: undefined,
    })
    if (next.phase === 'review' && !delegated) {
      const reviewed = withUi(next, {
        questions: [],
        questionSource: undefined,
        answers: {},
        currentQuestionId: undefined,
        lastAction: undefined,
      })
      await saveProject(conversationId, reviewed, true)
      return
    }
    await runInterview(conversationId, { ...next, phase: 'interview' }, {
      type: 'interview',
      input: text,
      phase: 'interview',
    })
  }

  const generate = async (conversationId: string) => {
    const project = getIdleSnapshot(conversationId).project
    if (!project) return
    if (project.phase !== 'review') throw new Error(`当前阶段不能生成提示词: ${project.phase}`)
    await runArtifact(conversationId, project, { type: 'artifact' })
  }

  const setEditor = (conversationId: string, editor: PromptArtifact) => {
    const snapshot = getSnapshot(conversationId)
    const project = snapshot.project
    if (!project || snapshot.running) return
    void saveProject(conversationId, withUi(project, { editor: cloneArtifact(editor) }))
  }

  const saveVersion = async (conversationId: string) => {
    const snapshot = getIdleSnapshot(conversationId)
    if (!snapshot.project || !snapshot.editor) return
    const project = saveManualPromptVersion(
      snapshot.project,
      snapshot.editor,
      getDomain(snapshot.project, opts.domains),
    )
    await saveProject(conversationId, withUi(project, { editor: cloneArtifact(snapshot.editor) }), true)
  }

  const restoreVersion = async (conversationId: string, versionId: string) => {
    const project = getIdleSnapshot(conversationId).project
    if (!project) return
    const restored = restorePromptVersion(project, versionId)
    const version = getActivePromptVersion(restored)
    if (!version) return
    await saveProject(conversationId, withUi(restored, { editor: cloneArtifact(version.artifact) }), true)
  }

  const optimize = async (conversationId: string, instruction: string) => {
    const snapshot = getIdleSnapshot(conversationId)
    if (!snapshot.project || !snapshot.editor) return
    if (snapshot.project.phase !== 'ready') {
      throw new Error(`当前阶段不能继续优化: ${snapshot.project.phase}`)
    }
    await runArtifact(conversationId, snapshot.project, {
      type: 'optimization',
      instruction: instruction.trim(),
      prompt: snapshot.editor.prompt,
    })
  }

  const retry = async (conversationId: string) => {
    const project = getIdleSnapshot(conversationId).project
    if (!project) return
    if (project.phase !== 'error') throw new Error(`当前阶段不能重试: ${project.phase}`)
    const action = getUi(project).lastAction
    if (!action) throw new Error('没有可重试的请求')
    if (action.type === 'interview') return runInterview(conversationId, project, action)
    return runArtifact(conversationId, project, action)
  }

  const stop = (conversationId: string) => {
    const request = requests.get(conversationId)
    if (!request) return false
    request.controller.abort(new DOMException('请求已停止', 'AbortError'))
    const project = getSnapshot(conversationId).project
    if (project) {
      persistence.invalidateRequest(project.id)
      const stopped = withUi({ ...project, phase: 'error', updatedAt: Date.now() }, {
        error: '请求已停止，可继续编辑后重试',
      })
      persistence.schedule(stopped)
      setSnapshot(conversationId, { project: stopped, running: false })
    }
    return true
  }

  const pause = (conversationId: string) => {
    const snapshot = getSnapshot(conversationId)
    const project = snapshot.project
    if (!project) return false
    const request = requests.get(conversationId)
    if (request) {
      request.controller.abort(new DOMException('项目已暂停', 'AbortError'))
      requests.delete(conversationId)
      persistence.invalidateRequest(project.id)
    }
    const paused = withUi(project, {
      currentQuestionId: snapshot.currentQuestionId ?? snapshot.questions[0]?.id,
      paused: true,
    })
    persistence.schedule(paused)
    setSnapshot(conversationId, { project: paused, running: false })
    return true
  }

  const resume = (conversationId: string) => {
    const snapshot = getSnapshot(conversationId)
    if (!snapshot.project) return false
    const project = withUi(snapshot.project, {
      currentQuestionId: snapshot.currentQuestionId ?? snapshot.questions[0]?.id,
      paused: false,
    })
    void saveProject(conversationId, project)
    return true
  }

  return {
    load,
    getSnapshot,
    subscribe(conversationId: string, listener: () => void) {
      const set = listeners.get(conversationId) ?? new Set()
      set.add(listener)
      listeners.set(conversationId, set)
      return () => {
        set.delete(listener)
        if (!set.size) listeners.delete(conversationId)
      }
    },
    start,
    submit,
    setAnswer,
    setCurrentQuestion,
    syncOutputSettings,
    syncAttachments,
    confirmConflict,
    submitAnswers,
    generate,
    setEditor,
    saveVersion,
    restoreVersion,
    optimize,
    retry,
    stop,
    pause,
    resume,
    getEditor: (conversationId: string) => getSnapshot(conversationId).editor,
    getDomainDefinition: (conversationId: string) => {
      const project = getSnapshot(conversationId).project
      return project ? getDomain(project, opts.domains) : opts.domains[0] ?? null
    },
    resolveAsset: (id: string) => opts.assets.resolve(id),
    async dispose() {
      requests.forEach((request) => request.controller.abort())
      requests.clear()
      await persistence.dispose()
      listeners.clear()
      sessions.clear()
    },
  }
}
