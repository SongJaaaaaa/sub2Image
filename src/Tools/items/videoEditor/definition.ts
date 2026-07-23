import type { WorkspaceTool } from '../../types'

const definition: WorkspaceTool = {
  id: 'video-editor',
  name: '视频剪辑',
  description: '在浏览器本地剪切、拼接视频，调整音频并导出 MP4',
  version: 1,
  media: 'video',
  author: '本地视频处理',
  cover: 'https://www.gstatic.com/aitestkitchen/website/flow/applets/first-party/preview/f472f46e-d957-4d54-89eb-94dc5a5f0bfd.webp',
  icon: 'https://www.gstatic.com/aitestkitchen/website/flow/applets/first-party/ada-14.png',
  load: () => import('./VideoEditorTool'),
}

export default definition
