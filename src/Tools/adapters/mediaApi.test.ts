import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMediaSpeech, createMediaTranscription, getMediaTranscription, listMediaVoices, MediaApiError } from './mediaApi'

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  refreshToken: vi.fn(),
}))

vi.mock('../../lib/sub2api', () => ({
  getSub2Token: mocks.getToken,
  refreshSub2Token: mocks.refreshToken,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getToken.mockReturnValue('access-token')
})

afterEach(() => vi.unstubAllGlobals())

describe('media API adapter', () => {
  it('通过同源代理携带 token 获取音色', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{
      name: 'zh-CN-XiaoxiaoNeural',
      locale: 'zh-CN',
      gender: 'Female',
      displayName: '晓晓',
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)

    await expect(listMediaVoices()).resolves.toHaveLength(1)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('/cloud-api/media/voices')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-token')
  })

  it('提交 TTS 参数和字幕 multipart', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(new Blob(['mp3']), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'job-1', status: 'queued' } }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetcher)

    const input = { text: '你好', voice: 'zh-CN-XiaoxiaoNeural', rate: 10, pitch: -5, volume: 20 }
    await createMediaSpeech(input)
    await createMediaTranscription(new Blob(['video'], { type: 'video/mp4' }), 'sample.mp4', 'zh')

    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual(input)
    const form = fetcher.mock.calls[1][1].body as FormData
    expect(form.get('language')).toBe('zh')
    expect((form.get('file') as File).name).toBe('sample.mp4')
  })

  it('查询字幕任务时禁用浏览器缓存', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: 'job-1', status: 'running' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)

    await getMediaTranscription('job-1')

    expect(fetcher.mock.calls[0][0]).toMatch(/^\/cloud-api\/media\/transcriptions\/job-1\?t=\d+$/)
    expect(fetcher.mock.calls[0][1].cache).toBe('no-store')
  })

  it('把开发代理连接失败转换成明确错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 })))

    await expect(listMediaVoices()).rejects.toEqual(expect.objectContaining<Partial<MediaApiError>>({
      status: 500,
      message: 'Cloud Server 未启动或代理连接失败',
    }))
  })

  it('显示 Speech Worker 返回的明确错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: 'Edge 音色服务暂时没有返回音频，请稍后重试',
    }), { status: 502, headers: { 'Content-Type': 'application/json' } })))

    await expect(createMediaSpeech({
      text: '试听',
      voice: 'zh-CN-XiaoxiaoNeural',
      rate: 0,
      pitch: 0,
      volume: 0,
    })).rejects.toEqual(expect.objectContaining({
      status: 502,
      message: 'Edge 音色服务暂时没有返回音频，请稍后重试',
    }))
  })
})
