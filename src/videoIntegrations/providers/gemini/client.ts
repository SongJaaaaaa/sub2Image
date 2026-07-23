import type { VideoInput, VideoProfile } from '../../types'
import { requestVideoJson } from '../../shared/http'
import { buildGeminiVideoRequest } from './request'
import type { GeminiVideoOperation } from './types'

function getGeminiUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function getHeaders(profile: VideoProfile) {
  const auth: Record<string, string> = profile.baseUrl.includes('generativelanguage.googleapis.com')
    ? { 'x-goog-api-key': profile.apiKey }
    : { Authorization: `Bearer ${profile.apiKey}` }
  return { ...auth, 'Content-Type': 'application/json' }
}

export function submitGeminiVideo(input: VideoInput, profile: VideoProfile, signal?: AbortSignal) {
  const model = profile.model.replace(/^models\//, '')
  return requestVideoJson<GeminiVideoOperation>(
    getGeminiUrl(profile.baseUrl, `models/${encodeURIComponent(model)}:predictLongRunning`),
    {
      method: 'POST',
      headers: getHeaders(profile),
      body: JSON.stringify(buildGeminiVideoRequest(input, profile)),
      signal,
    },
  )
}

export function pollGeminiVideo(remoteId: string, profile: VideoProfile, signal?: AbortSignal) {
  return requestVideoJson<GeminiVideoOperation>(
    getGeminiUrl(profile.baseUrl, remoteId),
    { headers: getHeaders(profile), signal },
  )
}
