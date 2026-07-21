import { describe, expect, it } from 'vitest'
import definition from '../definition'

describe('video editor definition', () => {
  it('registers a runnable video tool', () => {
    expect(definition.id).toBe('video-editor')
    expect(definition.name).toBe('视频剪辑')
    expect(definition.media).toBe('video')
    expect(definition.load).toBeTypeOf('function')
    expect(definition.cover).toBe('/tools/video-editor/cover.webp')
    expect(definition.icon).toBe('/tools/video-editor/icon.png')
  })
})
