import type { VideoOutput } from '../../types'
import type { JimengVideoGenerationResponse } from './types'

export function parseJimengVideoOutput(payload: JimengVideoGenerationResponse): VideoOutput {
  const url = payload.data?.[0]?.url?.trim()
  if (!url) throw new Error('即梦视频接口没有返回 data[0].url')
  return { url, mimeType: 'video/mp4' }
}
