import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitJimengVideo } from './client'
import { jimengVideoProvider } from './index'
import { buildJimengVideoRequest } from './request'
import { parseJimengVideoOutput } from './response'

const profile = {
  id: 'video-profile',
  name: '即梦视频',
  provider: 'jimeng' as const,
  baseUrl: '/sub2api-v1',
  apiKey: 'test-key',
  model: 'jimeng-video-3.5-pro',
  timeout: 600,
}

const input = {
  mode: 'text-to-video' as const,
  prompt: '海边日落，镜头缓慢向前推进',
  images: [],
  params: { duration: 5, aspectRatio: '16:9', resolution: '720p', n: 1 },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Jimeng video provider', () => {
  it('maps text-to-video request fields', () => {
    expect(buildJimengVideoRequest(input, profile)).toEqual({
      model: 'jimeng-video-3.5-pro',
      prompt: '海边日落，镜头缓慢向前推进',
      ratio: '16:9',
      resolution: '720p',
      duration: 5,
    })
  })

  it('does not guess image passthrough through Sub2API', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(() => buildJimengVideoRequest({ ...input, mode: 'image-to-video', images: ['data:image/png;base64,test'] }, profile))
      .toThrow('图片透传尚未验证')
    expect(warn).toHaveBeenCalledWith('[Jimeng Video] Sub2API 图片透传尚未验证', { mode: 'image-to-video', imageCount: 1 })
  })

  it('maps the synchronous video URL response', () => {
    expect(parseJimengVideoOutput({
      created: 1,
      data: [{ url: 'https://video.example.com/jimeng.mp4', revised_prompt: input.prompt }],
    })).toEqual({ url: 'https://video.example.com/jimeng.mp4', mimeType: 'video/mp4' })
    expect(() => parseJimengVideoOutput({ data: [] })).toThrow('data[0].url')
  })

  it('exposes model-specific capabilities', () => {
    expect(jimengVideoProvider.getCapabilities(profile)).toMatchObject({
      modes: ['text-to-video'],
      maxImages: 0,
      durations: [5, 10, 12],
      aspectRatios: ['9:16', '16:9'],
      resolutions: ['720p'],
    })
    expect(jimengVideoProvider.getCapabilities({ ...profile, model: 'jimeng-video-3.0' }).resolutions).toEqual(['720p', '1080p'])
    expect(jimengVideoProvider.getCapabilities({ ...profile, model: 'jimeng-video-seedance-2.0' }).durations).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
  })

  it('sends Sub2 Bearer auth, endpoint and AbortSignal', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ url: 'https://video.example.com/jimeng.mp4' }] })))
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()

    await submitJimengVideo(input, profile, controller.signal)

    expect(fetch).toHaveBeenCalledWith('/sub2api-v1/videos/generations', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify(buildJimengVideoRequest(input, profile)),
      signal: controller.signal,
    }))
  })
})
