import type { WorkspaceTool } from '../../types'

const definition: WorkspaceTool = {
  id: 'background-remover',
  name: '一键抠图',
  description: '自动识别主体，移除背景并保留毛发等细节',
  version: 1,
  media: 'image',
  author: '本地智能处理',
  cover: '/tools/background-remover/cover.webp',
  icon: '/tools/background-remover/icon.png',
  load: () => import('./BackgroundRemoverTool'),
}

export default definition
