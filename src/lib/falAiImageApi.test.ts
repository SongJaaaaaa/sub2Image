import { fal } from '@fal-ai/client'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { createDefaultFalProfile, DEFAULT_FAL_BASE_URL, DEFAULT_SETTINGS } from './apiProfiles'
import { callFalAiImageApi, getFalQueuedImageResult } from './falAiImageApi'

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
    queue: {
      subscribeToStatus: vi.fn(),
      result: vi.fn(),
    },
  },
}))

const falMock = fal as unknown as {
  config: Mock
  subscribe: Mock
  queue: {
    subscribeToStatus: Mock
    result: Mock
  }
}

describe('callFalAiImageApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('uses the default fal endpoint without proxyUrl', async () => {
    falMock.subscribe.mockResolvedValue({
      requestId: 'req-1',
      data: { images: [{ b64_json: 'aW1hZ2U=' }] },
    })

    await callFalAiImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    }, createDefaultFalProfile({ apiKey: 'fal-key', baseUrl: DEFAULT_FAL_BASE_URL }))

    expect(falMock.config).toHaveBeenCalledWith({
      credentials: 'fal-key',
      suppressLocalCredentialsWarning: true,
    })
  })

  it('passes custom fal API URL to the SDK proxyUrl option', async () => {
    falMock.subscribe.mockResolvedValue({
      requestId: 'req-1',
      data: { images: [{ b64_json: 'aW1hZ2U=' }] },
    })

    await callFalAiImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    }, createDefaultFalProfile({
      apiKey: 'fal-key',
      baseUrl: 'https://fal-proxy.example.com/api/fal/',
    }))

    expect(falMock.config).toHaveBeenCalledWith({
      credentials: 'fal-key',
      suppressLocalCredentialsWarning: true,
      proxyUrl: 'https://fal-proxy.example.com/api/fal',
    })
  })

  it('passes caller abort to fal subscribe', async () => {
    falMock.subscribe.mockImplementation((_endpoint, opts) => new Promise((_resolve, reject) => {
      opts.abortSignal.addEventListener('abort', () => reject(opts.abortSignal.reason), { once: true })
    }))
    const controller = new AbortController()
    const reason = new DOMException('用户停止', 'AbortError')
    const promise = callFalAiImageApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
      signal: controller.signal,
    }, createDefaultFalProfile({ apiKey: 'fal-key' }))
    const rejected = expect(promise).rejects.toBe(reason)

    await vi.waitFor(() => expect(falMock.subscribe).toHaveBeenCalledTimes(1))
    expect(falMock.subscribe.mock.calls[0][1]).toEqual(expect.objectContaining({
      abortSignal: controller.signal,
    }))
    controller.abort(reason)

    await rejected
  })

  it('passes caller abort through queued status, result and image download', async () => {
    falMock.queue.subscribeToStatus.mockResolvedValue({ status: 'COMPLETED' })
    falMock.queue.result.mockResolvedValue({
      requestId: 'req-1',
      data: { images: [{ url: 'https://cdn.example.com/image.png' }] },
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) {
        reject(new Error('missing signal'))
        return
      }
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const controller = new AbortController()
    const reason = new DOMException('用户停止', 'AbortError')
    const promise = getFalQueuedImageResult(
      createDefaultFalProfile({ apiKey: 'fal-key' }),
      'openai/gpt-image-2',
      'req-1',
      { ...DEFAULT_PARAMS },
      controller.signal,
    )
    const rejected = expect(promise).rejects.toBe(reason)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(falMock.queue.subscribeToStatus).toHaveBeenCalledWith('openai/gpt-image-2', {
      requestId: 'req-1',
      logs: true,
      abortSignal: controller.signal,
    })
    expect(falMock.queue.result).toHaveBeenCalledWith('openai/gpt-image-2', {
      requestId: 'req-1',
      abortSignal: controller.signal,
    })
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal)

    controller.abort(reason)

    await rejected
  })
})
