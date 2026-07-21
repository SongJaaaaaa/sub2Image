import { describe, expect, it } from 'vitest'
import { getClipFrames } from '../lib/media'

describe('video timeline frames', () => {
  it('keeps the frames covered by a trimmed clip', () => {
    const frames = Array.from({ length: 10 }, (_, idx) => `frame-${idx}`)
    expect(getClipFrames(frames, 10, 2, 6)).toEqual(['frame-2', 'frame-3', 'frame-4', 'frame-5'])
  })

  it('keeps one frame for a very short clip', () => {
    expect(getClipFrames(['a', 'b', 'c'], 3, 1.1, 1.2)).toEqual(['b'])
  })
})
