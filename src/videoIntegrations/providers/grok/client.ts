import type { VideoInput, VideoProfile } from '../../types'
import { requestVideoJson } from '../../shared/http'
import { buildGrokVideoRequest } from './request'
import type { GrokVideoGenerationResponse, GrokVideoStatusResponse } from './types'

function getGrokUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

function getHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

export function submitGrokVideo(input: VideoInput, profile: VideoProfile, signal?: AbortSignal) {
  return requestVideoJson<GrokVideoGenerationResponse>(
    getGrokUrl(profile.baseUrl, '/videos/generations'),
    {
      method: 'POST',
      headers: getHeaders(profile.apiKey),
      body: JSON.stringify(buildGrokVideoRequest(input, profile)),
      signal,
    },
  )
}

export function pollGrokVideo(remoteId: string, profile: VideoProfile, signal?: AbortSignal) {
  return requestVideoJson<GrokVideoStatusResponse>(
    getGrokUrl(profile.baseUrl, `/videos/${encodeURIComponent(remoteId)}`),
    { headers: getHeaders(profile.apiKey), signal },
  )
}
