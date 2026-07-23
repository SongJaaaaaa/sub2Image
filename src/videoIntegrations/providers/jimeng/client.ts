import type { VideoInput, VideoProfile } from '../../types'
import { requestVideoJson } from '../../shared/http'
import { buildJimengVideoRequest } from './request'
import type { JimengVideoGenerationResponse } from './types'

export function submitJimengVideo(input: VideoInput, profile: VideoProfile, signal?: AbortSignal) {
  const url = `${profile.baseUrl.replace(/\/+$/, '')}/videos/generations`
  return requestVideoJson<JimengVideoGenerationResponse>(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${profile.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildJimengVideoRequest(input, profile)),
    signal,
  })
}
