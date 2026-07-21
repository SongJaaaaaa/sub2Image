import type { BackgroundAudio } from '../types'

export function getBackgroundSourceTime(background: BackgroundAudio, time: number) {
  if (time < background.timelineStart || time >= background.timelineEnd) return null
  const length = background.sourceEnd - background.sourceStart
  return background.sourceStart + (time - background.timelineStart) % length
}

export function getBackgroundLoopCount(background: BackgroundAudio) {
  const sourceLength = background.sourceEnd - background.sourceStart
  const timelineLength = background.timelineEnd - background.timelineStart
  return Math.ceil(timelineLength / sourceLength)
}
