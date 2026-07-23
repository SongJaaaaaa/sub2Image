import { describe, expect, it, vi } from 'vitest'
import { pollVideoGeneration, runVideoGeneration } from './runner'

describe('video runner', () => {
  it('persists the remote job before polling to completion', async () => {
    const calls: string[] = []
    let pollCount = 0
    const provider = {
      id: 'grok' as const,
      getCapabilities: () => ({ modes: ['text-to-video' as const], maxImages: 0, durations: [6], aspectRatios: ['16:9'], resolutions: ['720p'] }),
      submit: async () => ({ job: { remoteId: 'request-1', pollInterval: 1 } }),
      poll: async () => {
        calls.push('poll')
        pollCount += 1
        return pollCount === 1
          ? { status: 'pending' as const }
          : { status: 'done' as const, output: { url: 'https://video.example.com/a.mp4' } }
      },
    }

    const output = await runVideoGeneration({
      provider,
      profile: { id: 'p1', name: '视频', provider: 'grok', baseUrl: '/v1', apiKey: 'key', model: 'grok-imagine-video', timeout: 60 },
      input: { mode: 'text-to-video', prompt: '测试', images: [], params: { duration: 6, aspectRatio: '16:9', resolution: '720p', n: 1 } },
      onSubmitted: (job) => { calls.push(job.remoteId) },
    })

    expect(calls).toEqual(['request-1', 'poll', 'poll'])
    expect(output).toEqual({ url: 'https://video.example.com/a.mp4' })
  })

  it('resumes an existing remote job without submitting again', async () => {
    const submit = vi.fn(async () => ({ job: { remoteId: 'new-request', pollInterval: 1 } }))
    const poll = vi.fn(async () => ({ status: 'done' as const, output: { url: 'https://video.example.com/recovered.mp4' } }))
    const provider = {
      id: 'grok' as const,
      getCapabilities: () => ({ modes: ['text-to-video' as const], maxImages: 0, durations: [6], aspectRatios: ['16:9'], resolutions: ['720p'] }),
      submit,
      poll,
    }

    const output = await pollVideoGeneration({
      provider,
      profile: { id: 'p1', name: '视频', provider: 'grok', baseUrl: '/sub2api-v1', apiKey: 'key', model: 'grok-imagine-video', timeout: 60 },
      job: { remoteId: 'request-1', pollInterval: 3000 },
    })

    expect(submit).not.toHaveBeenCalled()
    expect(poll).toHaveBeenCalledWith(
      { remoteId: 'request-1', pollInterval: 3000 },
      expect.objectContaining({ id: 'p1' }),
      undefined,
    )
    expect(output).toEqual({ url: 'https://video.example.com/recovered.mp4' })
  })

  it('returns synchronous provider output without polling', async () => {
    const poll = vi.fn()
    const provider = {
      id: 'jimeng' as const,
      getCapabilities: () => ({ modes: ['text-to-video' as const], maxImages: 0, durations: [5], aspectRatios: ['16:9'], resolutions: ['720p'] }),
      submit: async () => ({ output: { url: 'https://video.example.com/jimeng.mp4' } }),
      poll,
    }

    const output = await runVideoGeneration({
      provider,
      profile: { id: 'p1', name: '即梦视频', provider: 'jimeng', baseUrl: '/sub2api-v1', apiKey: 'key', model: 'jimeng-video-3.5-pro', timeout: 600 },
      input: { mode: 'text-to-video', prompt: '测试', images: [], params: { duration: 5, aspectRatio: '16:9', resolution: '720p', n: 1 } },
    })

    expect(poll).not.toHaveBeenCalled()
    expect(output).toEqual({ url: 'https://video.example.com/jimeng.mp4' })
  })
})
