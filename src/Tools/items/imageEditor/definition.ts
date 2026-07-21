import type { WorkspaceTool } from '../../types'

const definition: WorkspaceTool = {
  id: 'image-editor',
  name: '图片编辑器',
  description: '调整图片尺寸、添加文字与图形，完成裁剪、滤镜和水印处理',
  version: 1,
  media: 'image',
  author: '开源图像编辑工具',
  cover: '/tools/image-editor/cover.webp',
  icon: '/tools/image-editor/icon.png',
  load: () => import('./ImageEditorTool'),
}

export default definition
