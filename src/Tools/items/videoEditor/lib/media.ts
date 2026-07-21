import type { VideoClip } from '../types'

export function formatTime(value: number) {
  const total = Math.max(0, Math.floor(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function getClipStarts(clips: VideoClip[]) {
  const starts = new Map<string, number>()
  let time = 0
  for (const clip of clips) {
    starts.set(clip.id, time)
    time += clip.sourceEnd - clip.sourceStart
  }
  return starts
}

export function getProjectDuration(clips: VideoClip[]) {
  return clips.reduce((total, clip) => total + clip.sourceEnd - clip.sourceStart, 0)
}

export function getClipAtTime(clips: VideoClip[], time: number) {
  let start = 0
  for (const clip of clips) {
    const end = start + clip.sourceEnd - clip.sourceStart
    if (time < end || clip === clips[clips.length - 1]) return { clip, start, end }
    start = end
  }
  return null
}

export function getClipFrames(frames: string[], duration: number, start: number, end: number) {
  const from = Math.floor((start / duration) * frames.length)
  const to = Math.max(from + 1, Math.ceil((end / duration) * frames.length))
  return frames.slice(from, to)
}

export async function readVideoFrames(url: string, duration: number, onProgress?: (value: number) => void) {
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.src = url
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('视频帧读取失败'))
  })

  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = 68
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持视频帧提取')

  const count = Math.min(24, Math.max(8, Math.ceil(duration * 1.5)))
  const frames: string[] = []
  for (let idx = 0; idx < count; idx += 1) {
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve()
      video.onerror = () => reject(new Error('视频帧定位失败'))
      video.currentTime = Math.min(duration - 0.01, ((idx + 0.5) / count) * duration)
    })
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
    const width = video.videoWidth * scale
    const height = video.videoHeight * scale
    ctx.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    frames.push(canvas.toDataURL('image/jpeg', 0.72))
    onProgress?.((idx + 1) / count)
  }
  video.removeAttribute('src')
  video.load()
  return frames
}

export async function readVideoPoster(url: string) {
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.src = url
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('视频封面读取失败'))
  })

  const target = Math.min(0.1, Math.max(0, video.duration - 0.01))
  if (target > 0) {
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve()
      video.onerror = () => reject(new Error('视频封面定位失败'))
      video.currentTime = target
    })
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.min(720, video.videoWidth)
  canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持视频封面提取')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  video.removeAttribute('src')
  video.load()
  return canvas.toDataURL('image/jpeg', 0.86)
}

export async function readMediaInfo(file: File, url: string, kind: 'video' | 'audio') {
  const el = document.createElement(kind)
  el.preload = 'metadata'
  el.src = url

  const meta = await new Promise<{ duration: number, width: number, height: number }>((resolve, reject) => {
    el.onloadedmetadata = () => resolve({
      duration: el.duration,
      width: kind === 'video' ? (el as HTMLVideoElement).videoWidth : 0,
      height: kind === 'video' ? (el as HTMLVideoElement).videoHeight : 0,
    })
    el.onerror = () => reject(new Error(`${kind === 'video' ? '视频' : '音频'}格式无法读取`))
  })

  if (kind === 'audio') return { ...meta, codec: file.type || '未知格式', hasAudio: true }

  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 4 * 1024 * 1024)).arrayBuffer())
  const text = new TextDecoder('latin1').decode(bytes)
  const codecs = [
    ['avc1', 'H.264'],
    ['hvc1', 'H.265 / HEVC'],
    ['hev1', 'H.265 / HEVC'],
    ['vp09', 'VP9'],
    ['V_VP9', 'VP9'],
    ['V_VP8', 'VP8'],
    ['av01', 'AV1'],
  ]
  const codec = codecs.find(([key]) => text.includes(key))?.[1] || file.type.replace('video/', '').toUpperCase() || '未知编码'
  const hasAudio = ['mp4a', 'OpusHead', 'A_OPUS', 'A_VORBIS', 'sowt', 'twos'].some((key) => text.includes(key))
  return { ...meta, codec, hasAudio }
}
