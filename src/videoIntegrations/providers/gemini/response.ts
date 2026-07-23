import type { VideoJob, VideoPollResult, VideoProfile } from '../../types'
import type { GeminiVideoOperation } from './types'

function getVideoDownload(rawUrl: string, profile: VideoProfile) {
  const isGoogleProfile = profile.baseUrl.includes('generativelanguage.googleapis.com')
  const auth: Record<string, string> = isGoogleProfile
    ? { 'x-goog-api-key': profile.apiKey }
    : { Authorization: `Bearer ${profile.apiKey}` }

  if (!/^https?:\/\//i.test(rawUrl)) {
    const path = rawUrl.replace(/^\/+/, '').replace(/^v1(?:beta)?\/+/, '')
    return { url: `${profile.baseUrl.replace(/\/+$/, '')}/${path}`, requestHeaders: auth }
  }

  const url = new URL(rawUrl)
  if (url.hostname !== 'generativelanguage.googleapis.com') return { url: rawUrl }
  if (isGoogleProfile) return { url: rawUrl, requestHeaders: auth }
  const path = url.pathname.replace(/^\/v1(?:beta)?\//, '')
  return {
    url: `${profile.baseUrl.replace(/\/+$/, '')}/${path}${url.search}`,
    requestHeaders: auth,
  }
}

export function parseGeminiVideoJob(payload: GeminiVideoOperation): VideoJob {
  const remoteId = payload.name?.trim()
  if (!remoteId) throw new Error('Gemini 视频接口没有返回 operation name')
  return { remoteId, pollInterval: 10000 }
}

export function parseGeminiVideoPoll(payload: GeminiVideoOperation, profile: VideoProfile): VideoPollResult {
  if (payload.error) return { status: 'failed', error: payload.error.message || payload.error.status || 'Gemini 视频任务失败' }
  if (!payload.done) return { status: 'pending' }

  const result = payload.response?.generateVideoResponse
  const video = result?.generatedSamples?.[0]?.video
  const rawUrl = video?.uri?.trim()
  if (!rawUrl) {
    const reason = result?.raiMediaFilteredReasons?.filter(Boolean).join('；')
    return { status: 'failed', error: reason || 'Gemini 视频任务已完成，但没有返回视频地址' }
  }
  return {
    status: 'done',
    output: {
      ...getVideoDownload(rawUrl, profile),
      mimeType: video?.mimeType,
    },
  }
}
