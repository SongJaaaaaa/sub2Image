import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createOpenAiResponsesTextModel,
  TextModelResponseError,
  type OpenAiResponsesTextModelOptions,
  type TextModelRequest,
} from '..'
import { PROMPT_ARTIFACT_SCHEMA, PROMPT_INTERVIEW_SCHEMA } from '../core/schema'

const config = {
  endpoint: 'https://api.example.com/v1/responses',
  apiKey: 'test-key',
  model: 'gpt-test',
  timeoutMs: 2000,
}

const interview = {
  phase: 'interview',
  message: '请继续补充构图。',
  briefPatch: [{
    field: 'subject',
    value: '黑色风衣女性',
    status: 'answered',
    origin: 'user',
    locked: true,
  }],
  questions: [{
    id: 'composition',
    field: 'composition',
    text: '需要什么景别？',
    input: 'single',
    options: [{ label: '半身', value: 'medium-shot' }],
    required: true,
  }],
}

const request: TextModelRequest = {
  format: 'interview',
  instructions: '只返回符合协议的 JSON。',
  input: [
    '来源摘要：用户要制作海报',
    '完整 Brief：{"subject":"黑色风衣女性"}',
    '最近有效问答：构图尚未确认',
    '当前编辑版提示词：雨夜街头',
    '本轮回答或修改要求：改成半身构图',
  ].join('\n'),
}

function rawOutput(value: unknown, patch: Record<string, unknown> = {}) {
  return JSON.stringify({
    status: 'completed',
    output: [{
      type: 'message',
      content: [{
        type: 'output_text',
        text: typeof value === 'string' ? value : JSON.stringify(value),
      }],
    }],
    ...patch,
  })
}

function createFetch(raw = rawOutput(interview), status = 200) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(raw, {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

function createModel(fetcher: ReturnType<typeof createFetch>, opts: Partial<OpenAiResponsesTextModelOptions> = {}) {
  return createOpenAiResponsesTextModel({
    getConfig: () => config,
    fetch: fetcher,
    ...opts,
  })
}

async function getError(promise: Promise<unknown>) {
  try {
    await promise
    throw new Error('预期请求失败')
  } catch (err) {
    return err
  }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createOpenAiResponsesTextModel', () => {
  it('sends the complete context through a strict interview schema without Agent fields', async () => {
    const fetchMock = createFetch()
    const model = createModel(fetchMock)

    const result = await model.respond(request, new AbortController().signal)

    expect(result).toEqual({
      format: 'interview',
      output: interview,
      rawResponse: rawOutput(interview),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(url).toBe(config.endpoint)
    expect(init?.headers).toEqual({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    })
    expect(init?.cache).toBe('no-store')
    expect(body).toMatchObject({
      model: 'gpt-test',
      instructions: request.instructions,
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'prompt_interview_v1',
          schema: PROMPT_INTERVIEW_SCHEMA,
          strict: true,
        },
      },
    })
    expect(body.input[0].content[0]).toEqual({ type: 'input_text', text: request.input })
    expect(body.input[0].content[0].text).toContain('完整 Brief')
    expect(body.input[0].content[0].text).toContain('本轮回答或修改要求')
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('previous_response_id')
    expect(body).not.toHaveProperty('stream')
  })

  it('parses and converts a strict artifact response', async () => {
    const value = {
      domain: 'image',
      title: '雨夜海报',
      prompt: '一名穿黑色风衣的女性站在雨夜街头',
      negativePrompt: null,
      params: [
        { name: 'ratio', value: '3:4' },
        { name: 'steps', value: 30 },
      ],
      shotList: [{ index: 1, duration: null, prompt: '正面半身镜头', audio: null }],
    }
    const fetchMock = createFetch(rawOutput(value))
    const model = createModel(fetchMock)

    const result = await model.respond({ ...request, format: 'artifact' }, new AbortController().signal)
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))

    expect(result).toEqual({
      format: 'artifact',
      output: {
        domain: 'image',
        title: '雨夜海报',
        prompt: '一名穿黑色风衣的女性站在雨夜街头',
        params: { ratio: '3:4', steps: 30 },
        shotList: [{ index: 1, prompt: '正面半身镜头' }],
      },
      rawResponse: rawOutput(value),
    })
    expect(body.text.format).toEqual({
      type: 'json_schema',
      name: 'prompt_artifact_v1',
      schema: PROMPT_ARTIFACT_SCHEMA,
      strict: true,
    })
  })

  it('resolves image IDs at request time and sends input_image content', async () => {
    const fetchMock = createFetch()
    const resolveImage = vi.fn(async (id: string) => id === 'asset-1' ? 'data:image/png;base64,abc' : null)
    const model = createModel(fetchMock, { resolveImage })
    const input: TextModelRequest = {
      ...request,
      images: [{ id: 'asset-1', label: '@图1 主体参考' }],
    }

    expect(JSON.stringify(input)).not.toContain('base64')
    await model.respond(input, new AbortController().signal)

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(resolveImage).toHaveBeenCalledWith('asset-1', expect.any(AbortSignal))
    expect(body.input[0].content).toEqual([
      { type: 'input_text', text: request.input },
      { type: 'input_text', text: '图片素材 {"id":"asset-1","label":"@图1 主体参考"}' },
      { type: 'input_image', image_url: 'data:image/png;base64,abc' },
    ])
  })

  it('does not send a request when an image ID cannot be resolved', async () => {
    const fetchMock = createFetch()
    const model = createModel(fetchMock, { resolveImage: async () => null })

    await expect(model.respond({
      ...request,
      images: [{ id: 'missing', label: '已删除图片' }],
    }, new AbortController().signal)).rejects.toThrow('找不到图片素材：已删除图片')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'refusal',
      raw: JSON.stringify({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: '无法处理该请求' }] }],
      }),
      code: 'refusal',
      message: '无法处理该请求',
    },
    {
      name: 'incomplete',
      raw: rawOutput('不是 JSON', { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }),
      code: 'incomplete',
      message: '文本模型响应未完成：max_output_tokens',
    },
    {
      name: 'failed',
      raw: JSON.stringify({ status: 'failed', error: { message: '模型执行失败' }, output: [] }),
      code: 'failed',
      message: '模型执行失败',
    },
    {
      name: 'empty output',
      raw: JSON.stringify({ status: 'completed', output: [] }),
      code: 'empty-output',
      message: '文本模型没有返回结构化内容',
    },
  ])('reports $name before trying to parse JSON', async ({ raw, code, message }) => {
    const err = await getError(createModel(createFetch(raw)).respond(request, new AbortController().signal))

    expect(err).toBeInstanceOf(TextModelResponseError)
    expect(err).toMatchObject({ code, message, rawResponse: raw })
  })

  it('preserves the raw response when output_text contains invalid JSON', async () => {
    const raw = rawOutput('not-json')
    const err = await getError(createModel(createFetch(raw)).respond(request, new AbortController().signal))

    expect(err).toMatchObject({
      code: 'invalid-json',
      message: '文本模型返回的结构化内容不是有效 JSON',
      rawResponse: raw,
    })
    expect(console.error).toHaveBeenCalledWith(
      '[PromptStudio] 文本模型响应异常',
      { code: 'invalid-json', rawResponse: raw },
    )
  })

  it('preserves a non-JSON Responses API body', async () => {
    const raw = '<html>upstream error</html>'
    const err = await getError(createModel(createFetch(raw)).respond(request, new AbortController().signal))

    expect(err).toMatchObject({
      code: 'invalid-response',
      message: 'Responses API 返回的不是有效 JSON',
      rawResponse: raw,
    })
  })

  it.each([
    ['missing field', { phase: 'interview', message: '缺少 questions', briefPatch: [] }, '响应 缺少字段 questions'],
    ['unknown field', { ...interview, extra: true }, '响应 包含未知字段 extra'],
  ])('rejects an output with a $name', async (_name, value, message) => {
    const raw = rawOutput(value)
    const err = await getError(createModel(createFetch(raw)).respond(request, new AbortController().signal))

    expect(err).toMatchObject({ code: 'invalid-response', message, rawResponse: raw })
  })

  it('uses the injected HTTP error reader and preserves the response body', async () => {
    const raw = JSON.stringify({ error: { message: '原始上游错误' }, requestId: 'req-1' })
    const getErrorMessage = vi.fn(async () => '可读的上游错误')
    const model = createModel(createFetch(raw, 429), { getErrorMessage })

    const err = await getError(model.respond(request, new AbortController().signal))

    expect(getErrorMessage).toHaveBeenCalledTimes(1)
    expect(err).toMatchObject({ code: 'http', message: '可读的上游错误', rawResponse: raw })
  })

  it('reports the endpoint when the HTTP request cannot connect', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const err = await getError(createOpenAiResponsesTextModel({
      getConfig: () => config,
      fetch: fetchMock,
    }).respond(request, new AbortController().signal))

    expect(err).toMatchObject({
      message: `无法连接文本模型 API：${config.endpoint}。请检查接口地址、CORS 或 API 代理设置。`,
    })
    expect(console.error).toHaveBeenCalledWith(
      '[PromptStudio] 文本模型 HTTP 请求失败',
      { endpoint: config.endpoint, model: config.model },
      expect.any(TypeError),
    )
  })

  it('does not read config or call fetch when already aborted', async () => {
    const fetchMock = createFetch()
    const getConfig = vi.fn(() => config)
    const model = createOpenAiResponsesTextModel({ getConfig, fetch: fetchMock })
    const controller = new AbortController()
    controller.abort(new DOMException('用户停止', 'AbortError'))

    await expect(model.respond(request, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
      message: '用户停止',
    })
    expect(getConfig).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('settles when an in-flight fetch ignores the caller signal', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}))
    const model = createOpenAiResponsesTextModel({ getConfig: () => config, fetch: fetchMock })
    const controller = new AbortController()
    const result = expect(model.respond(request, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
      message: '用户停止',
    })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    controller.abort(new DOMException('用户停止', 'AbortError'))

    await result
  })

  it('settles on timeout when an injected fetch ignores the request signal', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}))
    const model = createOpenAiResponsesTextModel({
      getConfig: () => ({ ...config, timeoutMs: 1000 }),
      fetch: fetchMock,
    })
    const result = expect(model.respond(request, new AbortController().signal)).rejects.toMatchObject({
      name: 'TimeoutError',
      message: '请求超时',
    })

    await vi.advanceTimersByTimeAsync(1000)

    await result
  })
})
