import type { VideoProvider } from '../../types'
import { VIDEO_ASPECT_RATIOS } from '../../../types'
import { pollGrokVideo, submitGrokVideo } from './client'
import { parseGrokVideoJob, parseGrokVideoPoll } from './response'

export const grokVideoProvider: VideoProvider = {
  id: 'grok',
  getCapabilities: () => ({
    modes: ['text-to-video'],
    maxImages: 0,
    durations: [4, 6, 8, 10, 12, 15],
    aspectRatios: [...VIDEO_ASPECT_RATIOS],
    resolutions: ['480p', '720p'],
  }),
  submit: async (input, profile, signal) => ({ job: parseGrokVideoJob(await submitGrokVideo(input, profile, signal)) }),
  poll: async (job, profile, signal) => parseGrokVideoPoll(await pollGrokVideo(job.remoteId, profile, signal), profile),
}
