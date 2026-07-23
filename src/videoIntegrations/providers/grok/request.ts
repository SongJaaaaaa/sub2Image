import type { VideoInput, VideoProfile } from '../../types'

export function buildGrokVideoRequest(input: VideoInput, profile: VideoProfile) {
  if (input.images.length) {
    console.warn('[Grok Video] 图生视频图片字段尚未确认', { mode: input.mode, imageCount: input.images.length })
    throw new Error('Grok 图生视频的图片字段尚未确认，请先使用文生视频；请提供实际接口日志后再继续接入。')
  }
  return {
    model: profile.model,
    prompt: input.prompt,
    duration: input.params.duration,
    aspect_ratio: input.params.aspectRatio,
    resolution: input.params.resolution,
  }
}
