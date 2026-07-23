import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollGeminiVideo, submitGeminiVideo } from './client'
import { geminiVideoProvider } from './index'
import { buildGeminiVideoRequest } from './request'
import { parseGeminiVideoJob, parseGeminiVideoPoll } from './response'

const profile = {
  id: 'video-profile',
  name: 'Gemini 视频',
  provider: 'gemini' as const,
  baseUrl: '/sub2api-v1',
  apiKey: 'test-key',
  model: 'veo-3.1-generate-preview',
  timeout: 600,
}

const input = {
  mode: 'text-to-video' as const,
  prompt: '海边公路上的红色敞篷车，镜头跟随前进',
  images: [],
  params: { duration: 6, aspectRatio: '16:9', resolution: '720p', n: 1 },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Gemini video provider', () => {
  it('maps text-to-video request fields', () => {
    expect(buildGeminiVideoRequest(input, profile)).toEqual({
      instances: [{ prompt: input.prompt }],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: 6,
        numberOfVideos: 1,
        resolution: '720p',
      },
    })
  })

  it('maps one image Data URL to inlineData', () => {
    expect(buildGeminiVideoRequest({
      ...input,
      mode: 'image-to-video',
      images: ['data:image/webp;base64,aW1hZ2U='],
    }, profile).instances[0]).toEqual({
      prompt: input.prompt,
      image: {
        inlineData: {
          mimeType: 'image/webp',
          data: 'aW1hZ2U=',
        },
      },
    })
  })

  it('exposes capabilities for current Veo model families', () => {
    expect(geminiVideoProvider.getCapabilities(profile)).toMatchObject({
      modes: ['text-to-video', 'image-to-video'],
      maxImages: 1,
      durations: [4, 6, 8],
      resolutions: ['720p', '1080p', '4k'],
    })
    expect(geminiVideoProvider.getCapabilities({ ...profile, model: 'veo-2.0-generate-001' })).toMatchObject({
      durations: [5, 6, 8],
      resolutions: ['720p'],
    })
  })

  it('extracts operation names and maps pending, done and failed states', () => {
    expect(parseGeminiVideoJob({ name: 'models/veo/operations/job-1' })).toEqual({
      remoteId: 'models/veo/operations/job-1',
      pollInterval: 10000,
    })
    expect(parseGeminiVideoPoll({ name: 'job-1' }, profile)).toEqual({ status: 'pending' })
    expect(parseGeminiVideoPoll({ done: true, error: { message: '配额不足' } }, profile)).toEqual({
      status: 'failed',
      error: '配额不足',
    })
    expect(parseGeminiVideoPoll({
      done: true,
      response: { generateVideoResponse: { raiMediaFilteredReasons: ['内容被安全策略拦截'] } },
    }, profile)).toEqual({ status: 'failed', error: '内容被安全策略拦截' })
  })

  it('routes Google file URIs through Sub2API with Bearer auth', () => {
    expect(parseGeminiVideoPoll({
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [{
            video: {
              uri: 'https://generativelanguage.googleapis.com/v1beta/files/video-1:download?alt=media',
              mimeType: 'video/mp4',
            },
          }],
        },
      },
    }, profile)).toEqual({
      status: 'done',
      output: {
        url: '/sub2api-v1/files/video-1:download?alt=media',
        requestHeaders: { Authorization: 'Bearer test-key' },
        mimeType: 'video/mp4',
      },
    })
  })

  it('sends Sub2 Bearer auth, endpoint and AbortSignal', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'models/veo/operations/job-1' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ done: false })))
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()

    await submitGeminiVideo(input, profile, controller.signal)
    await pollGeminiVideo('models/veo/operations/job-1', profile, controller.signal)

    expect(fetch).toHaveBeenNthCalledWith(1, '/sub2api-v1/models/veo-3.1-generate-preview:predictLongRunning', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
      signal: controller.signal,
    }))
    expect(fetch).toHaveBeenNthCalledWith(2, '/sub2api-v1/models/veo/operations/job-1', expect.objectContaining({
      headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
      signal: controller.signal,
    }))
  })

  it('uses x-goog-api-key for the official Gemini API', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'operations/job-1' })))
    vi.stubGlobal('fetch', fetch)
    const direct = { ...profile, baseUrl: 'https://generativelanguage.googleapis.com/v1beta' }

    await submitGeminiVideo(input, direct)

    expect(fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning',
      expect.objectContaining({
        headers: { 'x-goog-api-key': 'test-key', 'Content-Type': 'application/json' },
      }),
    )
  })
})
