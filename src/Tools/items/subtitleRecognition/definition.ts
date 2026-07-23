import type { WorkspaceTool } from '../../types'

const definition: WorkspaceTool = {
  id: 'subtitle-recognition',
  name: '字幕识别',
  description: '识别视频中的人声，自动生成带时间轴的字幕',
  version: 1,
  media: 'video',
  author: 'AI 语音识别',
  cover: 'https://www.gstatic.com/aitestkitchen/website/flow/applets/first-party/preview/9ea653c0-7f0f-4ee1-8b8e-c1ec3a79cf04.webp',
  icon: 'https://www.gstatic.com/aitestkitchen/website/flow/applets/default/ada-17.png',
  load: () => import('./SubtitleRecognitionTool'),
}

export default definition
