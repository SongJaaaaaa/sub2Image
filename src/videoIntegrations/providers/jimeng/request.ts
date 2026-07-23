import type { VideoInput, VideoProfile } from '../../types'
import type { JimengVideoRequest } from './types'

export function buildJimengVideoRequest(input: VideoInput, profile: VideoProfile): JimengVideoRequest {
  if (input.images.length) {
    console.warn('[Jimeng Video] Sub2API 图片透传尚未验证', { mode: input.mode, imageCount: input.images.length })
    throw new Error('即梦图生视频经过 Sub2API 的图片透传尚未验证，请先使用文生视频。')
  }
  return {
    model: profile.model,
    prompt: input.prompt,
    ratio: input.params.aspectRatio,
    resolution: input.params.resolution,
    duration: input.params.duration,
  }
}
