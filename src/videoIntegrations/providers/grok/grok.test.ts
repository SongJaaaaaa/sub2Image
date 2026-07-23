import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollGrokVideo, submitGrokVideo } from './client'
import { buildGrokVideoRequest } from './request'
import { parseGrokVideoJob, parseGrokVideoPoll } from './response'

const profile = {
  id: 'video-profile',
  name: 'Agent 视频',
  provider: 'grok' as const,
  baseUrl: 'https://api.example.com/v1/',
  apiKey: 'test-key',
  model: 'grok-imagine-video',
  timeout: 600,
}

const input = {
  mode: 'text-to-video' as const,
  prompt: '城市夜景延时摄影',
  images: [],
  params: { duration: 6, aspectRatio: '16:9', resolution: '720p', n: 1 },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Grok video provider', () => {
  it('maps text-to-video request fields', () => {
    expect(buildGrokVideoRequest(input, profile)).toEqual({
      model: 'grok-imagine-video',
      prompt: '城市夜景延时摄影',
      duration: 6,
      aspect_ratio: '16:9',
      resolution: '720p',
    })
  })

  it('does not guess the unconfirmed image-to-video field', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(() => buildGrokVideoRequest({ ...input, mode: 'image-to-video', images: ['data:image/png;base64,test'] }, profile))
      .toThrow('图片字段尚未确认')
    expect(warn).toHaveBeenCalledWith('[Grok Video] 图生视频图片字段尚未确认', { mode: 'image-to-video', imageCount: 1 })
  })

  it('extracts job IDs and maps poll states', () => {
    expect(parseGrokVideoJob({ request_id: 'request-1' })).toEqual({ remoteId: 'request-1', pollInterval: 3000 })
    expect(parseGrokVideoPoll({ status: 'pending' }, profile)).toEqual({ status: 'pending' })
    expect(parseGrokVideoPoll({ status: 'done', video: { url: 'https://video.example.com/a.mp4', duration: 6 } }, profile)).toEqual({
      status: 'done',
      output: { url: 'https://video.example.com/a.mp4', duration: 6, width: undefined, height: undefined, mimeType: undefined },
    })
    expect(parseGrokVideoPoll({ status: 'expired', error: { message: '结果已过期' } }, profile)).toEqual({ status: 'failed', error: '结果已过期' })
    expect(parseGrokVideoPoll({ status: 'failed' }, profile)).toEqual({ status: 'failed', error: 'Grok 视频任务失败或已过期' })
  })

  it('routes relative content URLs through the configured API profile', () => {
    expect(parseGrokVideoPoll({
      status: 'done',
      video: { url: '/v1/videos/request-1/content', duration: 8 },
    }, { ...profile, baseUrl: '/sub2api-v1' })).toEqual({
      status: 'done',
      output: {
        url: '/sub2api-v1/videos/request-1/content',
        requestHeaders: { Authorization: 'Bearer test-key' },
        duration: 8,
        width: undefined,
        height: undefined,
        mimeType: undefined,
      },
    })
  })

  it('sends Bearer auth, endpoint and AbortSignal', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ request_id: 'request-1' })))
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()

    await submitGrokVideo(input, profile, controller.signal)
    await pollGrokVideo('request/1', profile, controller.signal)

    expect(fetch).toHaveBeenNthCalledWith(1, 'https://api.example.com/v1/videos/generations', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
      signal: controller.signal,
    }))
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://api.example.com/v1/videos/request%2F1', expect.objectContaining({
      headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
      signal: controller.signal,
    }))
  })
})
