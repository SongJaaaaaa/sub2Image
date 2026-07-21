import { describe, expect, it } from 'vitest'
import type { BackgroundAudio } from '../types'
import { getBackgroundLoopCount, getBackgroundSourceTime } from '../lib/audioTimeline'

const background = {
  file: new File(['audio'], 'music.mp3'),
  url: 'blob:audio',
  name: 'music.mp3',
  duration: 8,
  sourceStart: 2,
  sourceEnd: 5,
  timelineStart: 1,
  timelineEnd: 9,
  volume: 0.5,
} satisfies BackgroundAudio

describe('background audio timeline', () => {
  it('maps project time into the selected source range and loops', () => {
    expect(getBackgroundSourceTime(background, 1)).toBe(2)
    expect(getBackgroundSourceTime(background, 3.5)).toBe(4.5)
    expect(getBackgroundSourceTime(background, 4)).toBe(2)
    expect(getBackgroundSourceTime(background, 7.25)).toBe(2.25)
  })

  it('returns null outside the timeline range', () => {
    expect(getBackgroundSourceTime(background, 0.9)).toBeNull()
    expect(getBackgroundSourceTime(background, 9)).toBeNull()
  })

  it('counts how many source segments are needed', () => {
    expect(getBackgroundLoopCount(background)).toBe(3)
  })
})
