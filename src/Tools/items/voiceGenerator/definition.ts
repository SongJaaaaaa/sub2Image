import type { WorkspaceTool } from '../../types'

const definition: WorkspaceTool = {
  id: 'voice-generator',
  name: '音色工具',
  description: '从丰富音色库中选择声音，将文字转换为 MP3 音频',
  version: 1,
  media: 'video',
  author: 'Edge TTS',
  cover: 'https://www.gstatic.com/aitestkitchen/website/flow/applets/first-party/preview/00244c6b-e838-4bb0-983e-faa9cabf7c50.webp',
  icon: 'https://www.gstatic.com/aitestkitchen/website/flow/applets/default/ada-11.png',
  load: () => import('./VoiceGeneratorTool'),
}

export default definition
