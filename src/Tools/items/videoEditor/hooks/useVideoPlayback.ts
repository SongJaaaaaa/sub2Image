import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VideoClip, VideoSource } from '../types'
import { getClipAtTime, getProjectDuration } from '../lib/media'

type Params = {
  clips: VideoClip[]
  sources: VideoSource[]
  volume: number
  muted: boolean
  onTimeChange?: (value: number) => void
}

export function useVideoPlayback({ clips, sources, volume, muted, onTimeChange }: Params) {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [visibleClipId, setVisibleClipId] = useState('')
  const videosRef = useRef(new Map<string, HTMLVideoElement>())
  const duration = useMemo(() => getProjectDuration(clips), [clips])
  const active = getClipAtTime(clips, Math.min(time, Math.max(0, duration - 0.001)))
  const activeSource = sources.find((source) => source.id === active?.clip.sourceId)

  const updateTime = useCallback((value: number) => {
    setTime(value)
    onTimeChange?.(value)
  }, [onTimeChange])

  const seekTo = useCallback((value: number) => {
    const next = Math.max(0, Math.min(value, duration))
    const target = getClipAtTime(clips, Math.min(next, Math.max(0, duration - 0.001)))
    updateTime(next)
    if (!target) return
    const video = videosRef.current.get(target.clip.id)
    const videoTime = target.clip.sourceStart + next - target.start
    if (video && Math.abs(video.currentTime - videoTime) > 0.01) video.currentTime = videoTime
  }, [clips, duration, updateTime])

  useEffect(() => {
    const video = active ? videosRef.current.get(active.clip.id) : null
    if (!video || !active) {
      videosRef.current.forEach((item) => item.pause())
      setVisibleClipId('')
      return
    }

    const target = active.clip.sourceStart + time - active.start
    videosRef.current.forEach((item, clipId) => {
      if (clipId !== active.clip.id) item.pause()
    })
    if (video.readyState >= 1 && Math.abs(video.currentTime - target) > 0.15) video.currentTime = target
    video.volume = volume
    video.muted = muted
    if (playing) void video.play()
    else video.pause()

    if (active.clip.id === visibleClipId) return
    const reveal = () => setVisibleClipId(active.clip.id)
    if (typeof video.requestVideoFrameCallback === 'function') {
      const requestId = video.requestVideoFrameCallback(reveal)
      return () => video.cancelVideoFrameCallback(requestId)
    }
    if (video.readyState >= 2) {
      reveal()
      return
    }
    video.addEventListener('loadeddata', reveal, { once: true })
    return () => video.removeEventListener('loadeddata', reveal)
  }, [active?.clip.id, active?.clip.sourceStart, active?.start, muted, playing, visibleClipId, volume])

  useEffect(() => {
    if (!active) return
    const idx = clips.findIndex((clip) => clip.id === active.clip.id)
    const next = clips[idx + 1]
    const video = next ? videosRef.current.get(next.id) : null
    if (!next || !video) return
    const prepare = () => {
      if (Math.abs(video.currentTime - next.sourceStart) > 0.05) video.currentTime = next.sourceStart
    }
    if (video.readyState >= 1) prepare()
    else video.addEventListener('loadedmetadata', prepare, { once: true })
    return () => video.removeEventListener('loadedmetadata', prepare)
  }, [active?.clip.id, clips])

  const onVideoTimeUpdate = useCallback((clipId: string, video: HTMLVideoElement) => {
    if (!playing || !active || clipId !== active.clip.id) return
    if (video.currentTime >= active.clip.sourceEnd - 0.04) {
      if (active.end >= duration - 0.04) {
        setPlaying(false)
        seekTo(duration)
        return
      }
      const idx = clips.findIndex((clip) => clip.id === clipId)
      const next = clips[idx + 1]
      const nextVideo = next ? videosRef.current.get(next.id) : null
      if (next && nextVideo?.readyState && nextVideo.readyState >= 2) {
        nextVideo.currentTime = next.sourceStart
        nextVideo.volume = volume
        nextVideo.muted = muted
        void nextVideo.play()
      }
      video.pause()
      updateTime(active.end + 0.001)
      return
    }
    updateTime(active.start + video.currentTime - active.clip.sourceStart)
  }, [active, clips, duration, muted, playing, seekTo, updateTime, volume])

  const togglePlaying = useCallback(() => {
    if (time >= duration) seekTo(0)
    setPlaying((value) => !value)
  }, [duration, seekTo, time])

  const stop = useCallback(() => {
    setPlaying(false)
    videosRef.current.forEach((video) => video.pause())
  }, [])

  return {
    time,
    playing,
    visibleClipId,
    active,
    activeSource,
    duration,
    videosRef,
    seekTo,
    togglePlaying,
    stop,
    onVideoTimeUpdate,
  }
}

export type VideoPlayback = ReturnType<typeof useVideoPlayback>
