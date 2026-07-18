import type {
  PromptArtifact,
  PromptInterviewReply,
  PromptScalar,
  PromptValue,
} from '../types'
import { PROMPT_ARTIFACT_SCHEMA, PROMPT_INTERVIEW_SCHEMA } from '../core/schema'
import {
  TextModelResponseError,
  type TextModelFormat,
  type TextModelPort,
  type TextModelRequest,
  type TextModelResponse,
  type TextModelResponseErrorCode,
} from '../ports/textModel'

export type OpenAiResponsesTextModelConfig = {
  endpoint: string
  apiKey: string
  model: string
  timeoutMs: number
}

export type OpenAiResponsesTextModelOptions = {
  getConfig: () => OpenAiResponsesTextModelConfig
  resolveImage?: (id: string, signal: AbortSignal) => Promise<string | null>
  fetch?: typeof globalThis.fetch
  getErrorMessage?: (response: Response) => Promise<string>
  createAbortScope?: (signal: AbortSignal, timeoutMs: number) => {
    signal: AbortSignal
    dispose: () => void
  }
}

const formats = {
  interview: {
    name: 'prompt_interview_v1',
    schema: PROMPT_INTERVIEW_SCHEMA,
  },
  artifact: {
    name: 'prompt_artifact_v1',
    schema: PROMPT_ARTIFACT_SCHEMA,
  },
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertObject(value: unknown, keys: readonly string[], path: string) {
  if (!isRecord(value)) throw new Error(`${path} 必须是对象`)
  const missing = keys.find((key) => !(key in value))
  if (missing) throw new Error(`${path} 缺少字段 ${missing}`)
  const unknown = Object.keys(value).find((key) => !keys.includes(key))
  if (unknown) throw new Error(`${path} 包含未知字段 ${unknown}`)
  return value
}

function assertString(value: unknown, path: string) {
  if (typeof value !== 'string') throw new Error(`${path} 必须是字符串`)
  return value
}

function assertBoolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') throw new Error(`${path} 必须是布尔值`)
  return value
}

function assertNumber(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} 必须是数字`)
  return value
}

function assertEnum<const T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${path} 的值无效`)
  }
  return value as T
}

function parseScalar(value: unknown, path: string): PromptScalar {
  if (typeof value === 'string' || typeof value === 'boolean') return value
  return assertNumber(value, path)
}

function parseValue(value: unknown, path: string): PromptValue {
  if (value === null) return null
  if (Array.isArray(value)) return value.map((item, idx) => parseScalar(item, `${path}[${idx}]`))
  return parseScalar(value, path)
}

function parseInterview(value: unknown): PromptInterviewReply {
  const root = assertObject(value, ['phase', 'message', 'briefPatch', 'questions'], '响应')
  if (!Array.isArray(root.briefPatch)) throw new Error('响应.briefPatch 必须是数组')
  if (!Array.isArray(root.questions)) throw new Error('响应.questions 必须是数组')

  const briefPatch = root.briefPatch.map((item, idx) => {
    const path = `响应.briefPatch[${idx}]`
    const patch = assertObject(item, ['field', 'value', 'status', 'origin', 'locked'], path)
    return {
      field: assertString(patch.field, `${path}.field`),
      value: parseValue(patch.value, `${path}.value`),
      status: assertEnum(patch.status, ['answered', 'delegated', 'not-applicable'], `${path}.status`),
      origin: assertEnum(patch.origin, ['source', 'user', 'model'], `${path}.origin`),
      locked: assertBoolean(patch.locked, `${path}.locked`),
    }
  })

  const questions = root.questions.map((item, idx) => {
    const path = `响应.questions[${idx}]`
    const question = assertObject(item, ['id', 'field', 'text', 'input', 'options', 'required'], path)
    if (!Array.isArray(question.options)) throw new Error(`${path}.options 必须是数组`)
    return {
      id: assertString(question.id, `${path}.id`),
      field: assertString(question.field, `${path}.field`),
      text: assertString(question.text, `${path}.text`),
      input: assertEnum(question.input, ['single', 'multiple', 'text', 'number'], `${path}.input`),
      options: question.options.map((item, optionIdx) => {
        const optionPath = `${path}.options[${optionIdx}]`
        const option = assertObject(item, ['label', 'value'], optionPath)
        return {
          label: assertString(option.label, `${optionPath}.label`),
          value: parseScalar(option.value, `${optionPath}.value`),
        }
      }),
      required: assertBoolean(question.required, `${path}.required`),
    }
  })

  return {
    phase: assertEnum(root.phase, ['interview', 'review'], '响应.phase'),
    message: assertString(root.message, '响应.message'),
    briefPatch,
    questions,
  }
}

function parseArtifact(value: unknown): PromptArtifact {
  const root = assertObject(value, ['domain', 'title', 'prompt', 'negativePrompt', 'params', 'shotList'], '响应')
  const prompt = assertString(root.prompt, '响应.prompt')
  if (!prompt.trim()) throw new Error('响应.prompt 不能为空')
  if (root.negativePrompt !== null && typeof root.negativePrompt !== 'string') {
    throw new Error('响应.negativePrompt 必须是字符串或 null')
  }
  if (!Array.isArray(root.params)) throw new Error('响应.params 必须是数组')
  if (root.shotList !== null && !Array.isArray(root.shotList)) {
    throw new Error('响应.shotList 必须是数组或 null')
  }

  const params: Record<string, PromptScalar> = {}
  root.params.forEach((item, idx) => {
    const path = `响应.params[${idx}]`
    const param = assertObject(item, ['name', 'value'], path)
    params[assertString(param.name, `${path}.name`)] = parseScalar(param.value, `${path}.value`)
  })

  const shotList = root.shotList?.map((item, idx) => {
    const path = `响应.shotList[${idx}]`
    const shot = assertObject(item, ['index', 'duration', 'prompt', 'audio'], path)
    const index = assertNumber(shot.index, `${path}.index`)
    if (!Number.isInteger(index)) throw new Error(`${path}.index 必须是整数`)
    if (shot.duration !== null) assertNumber(shot.duration, `${path}.duration`)
    if (shot.audio !== null && typeof shot.audio !== 'string') throw new Error(`${path}.audio 必须是字符串或 null`)
    return {
      index,
      prompt: assertString(shot.prompt, `${path}.prompt`),
      ...(shot.duration === null ? {} : { duration: shot.duration as number }),
      ...(shot.audio === null ? {} : { audio: shot.audio as string }),
    }
  })

  return {
    domain: assertString(root.domain, '响应.domain'),
    title: assertString(root.title, '响应.title'),
    prompt,
    ...(root.negativePrompt === null ? {} : { negativePrompt: root.negativePrompt }),
    params,
    ...(shotList ? { shotList } : {}),
  }
}

function fail(code: TextModelResponseErrorCode, message: string, rawResponse: string): never {
  console.error('[PromptStudio] 文本模型响应异常', { code, rawResponse })
  throw new TextModelResponseError(code, message, rawResponse)
}

function getOutputText(payload: Record<string, unknown>, rawResponse: string) {
  if (payload.status === 'incomplete') {
    const details = isRecord(payload.incomplete_details) ? payload.incomplete_details : null
    const reason = details && typeof details.reason === 'string' ? `：${details.reason}` : ''
    fail('incomplete', `文本模型响应未完成${reason}`, rawResponse)
  }
  if (payload.status === 'failed') {
    const error = isRecord(payload.error) ? payload.error : null
    const message = error && typeof error.message === 'string' ? error.message : '文本模型响应失败'
    fail('failed', message, rawResponse)
  }

  const chunks: string[] = []
  let refusal = ''
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue
    for (const part of item.content) {
      if (!isRecord(part)) continue
      if (part.type === 'refusal') {
        refusal = typeof part.refusal === 'string' && part.refusal.trim()
          ? part.refusal
          : '文本模型拒绝了本次请求'
      }
      if (part.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) {
        chunks.push(part.text)
      }
    }
  }

  if (refusal) fail('refusal', refusal, rawResponse)
  if (chunks.length) return chunks.join('').trim()
  fail('empty-output', '文本模型没有返回结构化内容', rawResponse)
}

function parseResponse(format: TextModelFormat, payload: unknown, rawResponse: string): TextModelResponse {
  if (!isRecord(payload)) fail('invalid-response', '文本模型响应必须是对象', rawResponse)
  const text = getOutputText(payload, rawResponse)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    fail('invalid-json', '文本模型返回的结构化内容不是有效 JSON', rawResponse)
  }

  try {
    if (format === 'interview') {
      return { format, output: parseInterview(value), rawResponse }
    }
    return { format, output: parseArtifact(value), rawResponse }
  } catch (err) {
    fail('invalid-response', err instanceof Error ? err.message : '文本模型返回结构无效', rawResponse)
  }
}

async function defaultErrorMessage(response: Response) {
  const text = await response.text()
  try {
    const data = JSON.parse(text) as { error?: { message?: string }; message?: string }
    return data.error?.message || data.message || `HTTP ${response.status}`
  } catch {
    return text || `HTTP ${response.status}`
  }
}

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new DOMException('请求已停止', 'AbortError')
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal) {
  throwIfAborted(signal)
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('请求已停止', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (err) => {
        signal.removeEventListener('abort', abort)
        reject(err)
      },
    )
  })
}

function createRequestSignal(signal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason ?? new DOMException('请求已停止', 'AbortError'))
  const timer = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), timeoutMs)
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    },
  }
}

function assertConfig(config: OpenAiResponsesTextModelConfig) {
  if (!config.endpoint.trim()) throw new Error('缺少 Responses API URL')
  if (!config.apiKey.trim()) throw new Error('缺少 API Key')
  if (!config.model.trim()) throw new Error('缺少模型 ID')
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) throw new Error('请求超时时间无效')
}

async function createInput(input: TextModelRequest, opts: OpenAiResponsesTextModelOptions, signal: AbortSignal) {
  const content: Array<Record<string, string>> = [{ type: 'input_text', text: input.input }]
  for (const image of input.images ?? []) {
    throwIfAborted(signal)
    if (!opts.resolveImage) throw new Error(`未配置素材解析器：${image.id}`)
    const imageUrl = await withAbort(opts.resolveImage(image.id, signal), signal)
    throwIfAborted(signal)
    if (!imageUrl) throw new Error(`找不到图片素材：${image.label || image.id}`)
    content.push(
      { type: 'input_text', text: `图片素材 ${JSON.stringify({ id: image.id, label: image.label })}` },
      { type: 'input_image', image_url: imageUrl },
    )
  }
  return [{ role: 'user', content }]
}

export function createOpenAiResponsesTextModel(opts: OpenAiResponsesTextModelOptions): TextModelPort {
  return {
    respond: async (input, callerSignal) => {
      throwIfAborted(callerSignal)
      const config = opts.getConfig()
      assertConfig(config)
      const request = (opts.createAbortScope ?? createRequestSignal)(callerSignal, config.timeoutMs)

      try {
        const apiInput = await createInput(input, opts, request.signal)
        const format = formats[input.format]
        const response = await withAbort((opts.fetch ?? globalThis.fetch)(config.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            model: config.model,
            instructions: input.instructions,
            input: apiInput,
            store: false,
            text: {
              format: {
                type: 'json_schema',
                name: format.name,
                schema: format.schema,
                strict: true,
              },
            },
          }),
          signal: request.signal,
        }), request.signal)

        throwIfAborted(request.signal)
        if (!response.ok) {
          const rawResponse = await withAbort(response.clone().text(), request.signal)
          const message = await withAbort((opts.getErrorMessage ?? defaultErrorMessage)(response), request.signal)
          throwIfAborted(request.signal)
          fail('http', message, rawResponse)
        }

        const rawResponse = await withAbort(response.text(), request.signal)
        throwIfAborted(request.signal)
        let payload: unknown
        try {
          payload = JSON.parse(rawResponse)
        } catch {
          fail('invalid-response', 'Responses API 返回的不是有效 JSON', rawResponse)
        }
        return parseResponse(input.format, payload, rawResponse)
      } catch (err) {
        throwIfAborted(callerSignal)
        throwIfAborted(request.signal)
        if (err instanceof TypeError && err.message === 'Failed to fetch') {
          console.error('[PromptStudio] 文本模型 HTTP 请求失败', {
            endpoint: config.endpoint,
            model: config.model,
          }, err)
          throw new Error(`无法连接文本模型 API：${config.endpoint}。请检查接口地址、CORS 或 API 代理设置。`)
        }
        throw err
      } finally {
        request.dispose()
      }
    },
  }
}
