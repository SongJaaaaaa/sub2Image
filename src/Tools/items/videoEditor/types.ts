export type VideoSource = {
  id: string
  file: File
  url: string
  name: string
  duration: number
  width: number
  height: number
  codec: string
  hasAudio: boolean
  frames: string[]
}

export type VideoClip = {
  id: string
  sourceId: string
  name: string
  sourceStart: number
  sourceEnd: number
}

export type BackgroundAudio = {
  file: File
  url: string
  name: string
  duration: number
  sourceStart: number
  sourceEnd: number
  timelineStart: number
  timelineEnd: number
  volume: number
}

export type ImageOverlay = {
  id: string
  file: File
  url: string
  name: string
  sourceWidth: number
  sourceHeight: number
  start: number
  end: number
  x: number
  y: number
  width: number
  rotation: number
  opacity: number
}

export type ImportStatus = {
  label: string
  progress: number
}

export type ExportRatio = '16:9' | '9:16' | '1:1'
export type ExportQuality = '720p' | '1080p'

export type ExportProject = {
  sources: VideoSource[]
  clips: VideoClip[]
  overlays: ImageOverlay[]
  background: BackgroundAudio | null
  originalVolume: number
  muted: boolean
  ratio: ExportRatio
  quality: ExportQuality
}
