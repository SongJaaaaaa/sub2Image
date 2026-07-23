import type { VideoInput, VideoProfile } from '../../types'
import type { GeminiVideoRequest } from './types'

export function buildGeminiVideoRequest(input: VideoInput, profile: VideoProfile): GeminiVideoRequest {
  if (input.images.length > 1) throw new Error('Gemini 图生视频最多支持一张起始图片')
  if (input.params.resolution !== '720p' && input.params.duration !== 8) {
    throw new Error('Gemini 生成 1080p 或 4k 视频时，时长必须为 8 秒')
  }
  if (profile.model.startsWith('veo-3.0') && input.params.resolution === '1080p' && input.params.aspectRatio !== '16:9') {
    throw new Error('Veo 3.0 生成 1080p 视频时，仅支持 16:9')
  }

  const image = input.images[0]
  const match = image?.match(/^data:([^;,]+);base64,(.+)$/)
  if (image && !match) throw new Error('Gemini 图生视频需要 base64 Data URL 图片')

  return {
    instances: [{
      prompt: input.prompt,
      ...(match ? {
        image: {
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        },
      } : {}),
    }],
    parameters: {
      aspectRatio: input.params.aspectRatio,
      durationSeconds: input.params.duration,
      numberOfVideos: 1,
      ...(!profile.model.startsWith('veo-2.') ? { resolution: input.params.resolution } : {}),
    },
  }
}
