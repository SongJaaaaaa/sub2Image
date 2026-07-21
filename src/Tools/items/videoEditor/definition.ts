import type { WorkspaceTool } from '../../types'

const definition: WorkspaceTool = {
  id: 'video-editor',
  name: '视频剪辑',
  description: '在浏览器本地剪切、拼接视频，调整音频并导出 MP4',
  version: 1,
  media: 'video',
  author: '本地视频处理',
  cover: '/tools/video-editor/cover.webp',
  icon: '/tools/video-editor/icon.png',
  load: () => import('./VideoEditorTool'),
}

export default definition
