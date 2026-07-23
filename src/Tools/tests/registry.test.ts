import { describe, expect, it } from 'vitest'
import { defineWorkspaceTools, plannedWorkspaceTools, workspaceToolCards } from '../registry'

const tool = {
  id: 'image-editor',
  name: '图片编辑器',
  description: '编辑单张图片',
  version: 1,
  media: 'image' as const,
  load: async () => ({ default: () => null }),
}

describe('Workspace Tool registry', () => {
  it('keeps registered tools in order', () => {
    expect(defineWorkspaceTools([tool])).toEqual([tool])
  })

  it('rejects duplicate ids', () => {
    expect(() => defineWorkspaceTools([tool, { ...tool }])).toThrow('Workspace Tool ID 重复：image-editor')
  })

  it('includes ready and planned tools in cards', () => {
    expect(plannedWorkspaceTools.map((item) => item.id)).toEqual(['video-resizer'])
    expect(workspaceToolCards.map((item) => item.id)).toEqual([
      'image-editor',
      'background-remover',
      'video-editor',
      'voice-generator',
      'subtitle-recognition',
      'video-resizer',
    ])
  })
})
