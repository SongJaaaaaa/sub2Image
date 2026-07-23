import type { VideoProvider } from '../../types'
import { submitJimengVideo } from './client'
import { parseJimengVideoOutput } from './response'

export const jimengVideoProvider: VideoProvider = {
  id: 'jimeng',
  getCapabilities: (profile) => {
    const model = profile.model.toLowerCase()
    const durations = model.includes('veo3')
      ? [8]
      : model.includes('sora2') ? [4, 8, 12]
        : model.includes('3.5-pro') ? [5, 10, 12]
          : model.includes('seedance-2.0') ? Array.from({ length: 12 }, (_, idx) => idx + 4)
            : [5, 10]
    const supportsResolution = model === 'jimeng-video-3.0' || model === 'jimeng-video-3.0-fast'
    return {
      modes: ['text-to-video'],
      maxImages: 0,
      durations,
      aspectRatios: ['9:16', '16:9'],
      resolutions: supportsResolution ? ['720p', '1080p'] : ['720p'],
    }
  },
  submit: async (input, profile, signal) => ({
    output: parseJimengVideoOutput(await submitJimengVideo(input, profile, signal)),
  }),
}
