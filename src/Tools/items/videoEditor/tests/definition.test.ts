import { describe, expect, it } from 'vitest'
import definition from '../definition'

describe('video editor definition', () => {
  it('registers a runnable video tool', () => {
    expect(definition.id).toBe('video-editor')
    expect(definition.name).toBe('视频剪辑')
    expect(definition.media).toBe('video')
    expect(definition.load).toBeTypeOf('function')
    expect(definition.cover).toBe('https://www.gstatic.com/aitestkitchen/website/flow/applets/first-party/preview/f472f46e-d957-4d54-89eb-94dc5a5f0bfd.webp')
    expect(definition.icon).toBe('https://www.gstatic.com/aitestkitchen/website/flow/applets/first-party/ada-14.png')
  })
})
