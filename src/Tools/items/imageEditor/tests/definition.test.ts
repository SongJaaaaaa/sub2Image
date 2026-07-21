import { describe, expect, it } from 'vitest'
import definition from '../definition'
import { filerobotConfig } from '../filerobotConfig'

describe('image editor tool', () => {
  it('registers the editor with the visual entry assets', () => {
    expect(definition.id).toBe('image-editor')
    expect(definition.name).toBe('图片编辑器')
    expect(definition.cover).toBe('/tools/image-editor/cover.webp')
    expect(definition.icon).toBe('/tools/image-editor/icon.png')
  })

  it('keeps all local Filerobot editing tabs enabled', () => {
    expect(filerobotConfig.tabsIds).toEqual(['Adjust', 'Annotate', 'Filters', 'Finetune', 'Resize', 'Watermark'])
    expect(filerobotConfig.defaultToolId).toBe('Crop')
    expect(filerobotConfig.translations.save).toBe('保存')
  })
})
