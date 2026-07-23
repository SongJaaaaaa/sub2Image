import type { VideoProvider } from '../../types'
import { pollGeminiVideo, submitGeminiVideo } from './client'
import { parseGeminiVideoJob, parseGeminiVideoPoll } from './response'

export const geminiVideoProvider: VideoProvider = {
  id: 'gemini',
  getCapabilities: (profile) => {
    const model = profile.model.toLowerCase()
    const isVeo2 = model.startsWith('veo-2.')
    const isVeo31 = model.startsWith('veo-3.1')
    const isLite = model.includes('lite')
    return {
      modes: ['text-to-video', 'image-to-video'],
      maxImages: 1,
      durations: isVeo2 ? [5, 6, 8] : isVeo31 ? [4, 6, 8] : [8],
      aspectRatios: ['9:16', '16:9'],
      resolutions: isVeo2 ? ['720p'] : isVeo31 && !isLite ? ['720p', '1080p', '4k'] : ['720p', '1080p'],
    }
  },
  submit: async (input, profile, signal) => ({ job: parseGeminiVideoJob(await submitGeminiVideo(input, profile, signal)) }),
  poll: async (job, profile, signal) => parseGeminiVideoPoll(await pollGeminiVideo(job.remoteId, profile, signal), profile),
}
