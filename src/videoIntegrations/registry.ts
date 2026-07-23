import { geminiVideoProvider } from './providers/gemini'
import { grokVideoProvider } from './providers/grok'
import { jimengVideoProvider } from './providers/jimeng'
import type { VideoProvider, VideoProviderId } from './types'

const providers: Record<VideoProviderId, VideoProvider> = {
  grok: grokVideoProvider,
  gemini: geminiVideoProvider,
  jimeng: jimengVideoProvider,
}

export function getVideoProvider(id: VideoProviderId): VideoProvider {
  return providers[id]
}

export function resolveVideoProviderId(platform = '', model = ''): VideoProviderId {
  const name = platform.trim().toLowerCase()
  const modelName = model.trim().toLowerCase()
  if (modelName.startsWith('jimeng-video-')) return 'jimeng'
  if (name === 'gemini' || name === 'google' || modelName.startsWith('veo-')) return 'gemini'
  return 'grok'
}
