import type { VideoJob, VideoPollResult, VideoProfile } from '../../types'
import type { GrokVideoGenerationResponse, GrokVideoStatusResponse } from './types'

export function parseGrokVideoJob(payload: GrokVideoGenerationResponse): VideoJob {
  const remoteId = payload.request_id?.trim()
  if (!remoteId) throw new Error('Grok 视频接口没有返回 request_id')
  return { remoteId, pollInterval: 3000 }
}

export function parseGrokVideoPoll(payload: GrokVideoStatusResponse, profile: VideoProfile): VideoPollResult {
  if (payload.status === 'pending') return { status: 'pending' }
  if (payload.status === 'done') {
    const rawUrl = payload.video?.url?.trim()
    if (!rawUrl) return { status: 'failed', error: 'Grok 视频任务已完成，但没有返回视频地址' }
    const isAbsolute = /^https?:\/\//i.test(rawUrl)
    const path = rawUrl.replace(/^\/+/, '').replace(/^v1\/+/, '')
    const url = isAbsolute ? rawUrl : `${profile.baseUrl.replace(/\/+$/, '')}/${path}`
    return {
      status: 'done',
      output: {
        url,
        ...(isAbsolute ? {} : { requestHeaders: { Authorization: `Bearer ${profile.apiKey}` } }),
        duration: payload.video?.duration,
        width: payload.video?.width,
        height: payload.video?.height,
        mimeType: payload.video?.mime_type,
      },
    }
  }
  if (payload.status === 'expired' || payload.status === 'failed') {
    return { status: 'failed', error: payload.error?.message || 'Grok 视频任务失败或已过期' }
  }
  return { status: 'failed', error: `Grok 视频任务返回了未知状态：${payload.status || '空'}` }
}
