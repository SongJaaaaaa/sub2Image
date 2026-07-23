import type { VideoParams } from '../types'

export type { VideoParams } from '../types'

export type VideoProviderId = 'grok' | 'gemini' | 'jimeng'

export type VideoMode = 'text-to-video' | 'image-to-video'

export interface VideoInput {
  mode: VideoMode
  prompt: string
  images: string[]
  params: VideoParams
}

export interface VideoProfile {
  id: string
  name: string
  provider: VideoProviderId
  baseUrl: string
  apiKey: string
  model: string
  timeout: number
}

export interface VideoCapabilities {
  modes: VideoMode[]
  maxImages: number
  durations: number[]
  aspectRatios: string[]
  resolutions: string[]
}

export interface VideoJob {
  remoteId: string
  pollInterval: number
}

export interface VideoOutput {
  url: string
  requestHeaders?: Record<string, string>
  duration?: number
  width?: number
  height?: number
  mimeType?: string
}

export type VideoSubmitResult =
  | { job: VideoJob }
  | { output: VideoOutput }

export type VideoPollResult =
  | { status: 'pending'; progress?: number }
  | { status: 'done'; output: VideoOutput }
  | { status: 'failed'; error: string }

export interface VideoProvider {
  id: VideoProviderId
  getCapabilities: (profile: VideoProfile) => VideoCapabilities
  submit: (input: VideoInput, profile: VideoProfile, signal?: AbortSignal) => Promise<VideoSubmitResult>
  poll?: (job: VideoJob, profile: VideoProfile, signal?: AbortSignal) => Promise<VideoPollResult>
}
