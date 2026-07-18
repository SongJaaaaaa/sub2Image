import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiProfile } from '../../types'
import { TextModelResponseError, type TextModelRequest } from '../../features/promptStudio'
import { createDefaultOpenAIProfile } from '../../lib/apiProfiles'

const proxyMocks = vi.hoisted(() => ({
  readClientDevProxyConfig: vi.fn(),
}))

vi.mock('../../lib/devProxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/devProxy')>()
  return {
    ...actual,
    readClientDevProxyConfig: proxyMocks.readClientDevProxyConfig,
  }
})

import { createSub2ImageTextModel } from './sub2ImageTextModel'

const input: TextModelRequest = {
  format: 'interview',
  instructions: '按要求返回 JSON',
  input: '帮我整理提示词',
}

const createProfile = (overrides: Partial<ApiProfile> = {}) => createDefaultOpenAIProfile({
  id: 'text-profile',
  name: 'Agent 文本模型',
  baseUrl: 'https://api.one.example/v1',
  apiKey: 'key-one',
  model: 'model-one',
  timeout: 2,
  apiMode: 'responses',
  apiProxy: false,
  ...overrides,
})

const createOkResponse = () => new Response(JSON.stringify({
  id: 'resp-1',
  output: [{
    type: 'message',
    content: [{
      type: 'output_text',
      text: JSON.stringify({
        phase: 'interview',
        message: '请继续补充',
        briefPatch: [],
        questions: [],
      }),
    }],
  }],
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
})

beforeEach(() => {
  proxyMocks.readClientDevProxyConfig.mockReset().mockReturnValue(null)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createSub2ImageTextModel', () => {
  it('reads the latest Profile for every request', async () => {
    let profile = createProfile()
    const getAgentTextProfile = vi.fn(() => profile)
    const fetchMock = vi.fn<typeof fetch>(async () => createOkResponse())
    const model = createSub2ImageTextModel({ getAgentTextProfile, fetch: fetchMock })

    await model.respond(input, new AbortController().signal)
    profile = createProfile({
      baseUrl: 'https://api.two.example/compatible/v1',
      apiKey: 'key-two',
      model: 'model-two',
      timeout: 9,
    })
    await model.respond(input, new AbortController().signal)

    expect(getAgentTextProfile).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [firstUrl, firstInit] = fetchMock.mock.calls[0]
    const [secondUrl, secondInit] = fetchMock.mock.calls[1]
    expect(firstUrl).toBe('https://api.one.example/v1/responses')
    expect(firstInit?.headers).toMatchObject({ Authorization: 'Bearer key-one' })
    expect(JSON.parse(String(firstInit?.body)).model).toBe('model-one')
    expect(secondUrl).toBe('https://api.two.example/compatible/v1/responses')
    expect(secondInit?.headers).toMatchObject({ Authorization: 'Bearer key-two' })
    expect(JSON.parse(String(secondInit?.body)).model).toBe('model-two')
  })

  it('converts the Profile timeout from seconds to milliseconds', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const model = createSub2ImageTextModel({
      getAgentTextProfile: () => createProfile({ timeout: 2 }),
      fetch: fetchMock,
    })
    const result = expect(model.respond(input, new AbortController().signal)).rejects.toMatchObject({
      name: 'TimeoutError',
      message: '请求超时',
    })

    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    await result
  })

  it('uses the configured development proxy URL', async () => {
    proxyMocks.readClientDevProxyConfig.mockReturnValue({
      enabled: true,
      prefix: '/text-proxy',
      target: 'https://upstream.example/v1',
      changeOrigin: true,
      secure: false,
    })
    const fetchMock = vi.fn<typeof fetch>(async () => createOkResponse())
    const model = createSub2ImageTextModel({
      getAgentTextProfile: () => createProfile({ apiProxy: true }),
      fetch: fetchMock,
    })

    await model.respond(input, new AbortController().signal)

    expect(fetchMock.mock.calls[0][0]).toBe('/text-proxy/responses')
  })

  it('uses the selected Sub2API text model and same-origin Responses route', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => createOkResponse())
    const model = createSub2ImageTextModel({
      getAgentTextProfile: () => createProfile({
        id: 'sub2api-text-8-model-one',
        baseUrl: '/sub2api-v1',
        apiKey: 'sub2-group-key',
        model: 'model-from-system-config',
      }),
      fetch: fetchMock,
    })

    await model.respond(input, new AbortController().signal)

    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(url).toBe('/sub2api-v1/responses')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sub2-group-key' })
    expect(body).toMatchObject({
      model: 'model-from-system-config',
      instructions: input.instructions,
      store: false,
      text: { format: { type: 'json_schema', name: 'prompt_interview_v1', strict: true } },
    })
  })

  it.each<[string, ApiProfile | null, string]>([
    ['缺少 Profile', null, '未配置 Agent 文本模型，请先在设置中选择文本模型配置。'],
    ['provider 错误', createProfile({ provider: 'fal' }), '提示词工作台需要使用 OpenAI provider 的文本模型配置。'],
    ['apiMode 错误', createProfile({ apiMode: 'images' }), '提示词工作台需要使用 Responses API 模式的文本模型配置。'],
    ['配置不完整', createProfile({ apiKey: '' }), '文本模型 API 配置不完整：缺少 API Key'],
  ])('%s 时打开设置并抛出配置错误', async (_name, profile, message) => {
    const openAgentTextSettings = vi.fn()
    const fetchMock = vi.fn(async () => createOkResponse())
    const model = createSub2ImageTextModel({
      getAgentTextProfile: () => profile,
      fetch: fetchMock,
      openAgentTextSettings,
    })

    await expect(model.respond(input, new AbortController().signal)).rejects.toThrow(message)

    expect(openAgentTextSettings).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('extracts the HTTP error message and preserves the raw response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const rawResponse = JSON.stringify({
      error: { message: '上游配额不足' },
      requestId: 'req-1',
    })
    const model = createSub2ImageTextModel({
      getAgentTextProfile: () => createProfile(),
      fetch: vi.fn(async () => new Response(rawResponse, {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })),
    })

    const err = await model.respond(input, new AbortController().signal).catch((error: unknown) => error)

    expect(err).toBeInstanceOf(TextModelResponseError)
    expect(err).toMatchObject({
      code: 'http',
      message: '上游配额不足',
      rawResponse,
    })
  })
})
