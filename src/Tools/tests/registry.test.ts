import { describe, expect, it } from 'vitest'
import { defineWorkspaceTools } from '../registry'

const tool = {
  id: 'image-editor',
  name: '图片编辑器',
  description: '编辑单张图片',
  version: 1,
  load: async () => ({ default: () => null }),
}

describe('Workspace Tool registry', () => {
  it('keeps registered tools in order', () => {
    expect(defineWorkspaceTools([tool])).toEqual([tool])
  })

  it('rejects duplicate ids', () => {
    expect(() => defineWorkspaceTools([tool, { ...tool }])).toThrow('Workspace Tool ID 重复：image-editor')
  })
})
