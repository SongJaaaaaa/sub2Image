import type { VideoOutput } from '../../videoIntegrations'
import { deleteVideo, putVideo, storeImageWithSize } from '../../lib/db'
import { genId } from '../../lib/id'
import { cacheImage } from '../imageLibrary'

async function createVideoPoster(blob: Blob, output: VideoOutput) {
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise<{ posterDataUrl: string; duration: number; width: number; height: number }>((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      let settled = false
      const drawPoster = () => {
        if (settled) return
        const width = video.videoWidth || output.width || 0
        const height = video.videoHeight || output.height || 0
        if (!width || !height) {
          reject(new Error('无法读取生成视频的尺寸'))
          settled = true
          return
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法生成视频封面'))
          settled = true
          return
        }
        ctx.drawImage(video, 0, 0, width, height)
        settled = true
        resolve({
          posterDataUrl: canvas.toDataURL('image/jpeg', 0.9),
          duration: Number.isFinite(video.duration) ? video.duration : output.duration ?? 0,
          width,
          height,
        })
      }
      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : output.duration ?? 0
        if (duration > 0) {
          video.currentTime = Math.min(1, duration * 0.1)
          return
        }
        drawPoster()
      }
      video.onseeked = drawPoster
      video.onerror = () => {
        if (settled) return
        settled = true
        reject(new Error('无法读取生成视频'))
      }
      video.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function storeVideoOutput(output: VideoOutput, signal?: AbortSignal) {
  const response = await fetch(output.url, { headers: output.requestHeaders, signal })
  if (!response.ok) throw new Error(`下载生成视频失败：${response.status}`)
  const blob = await response.blob()
  signal?.throwIfAborted()
  const metadata = await createVideoPoster(blob, output)
  signal?.throwIfAborted()
  const videoId = genId()
  const now = Date.now()
  await putVideo({
    id: videoId,
    blob,
    name: `generated-video-${now}.mp4`,
    mimeType: blob.type || output.mimeType || 'video/mp4',
    duration: metadata.duration,
    width: metadata.width,
    height: metadata.height,
    createdAt: now,
  })
  try {
    const poster = await storeImageWithSize(metadata.posterDataUrl, 'generated')
    cacheImage(poster.id, metadata.posterDataUrl)
    return { videoId, posterId: poster.id }
  } catch (err) {
    await deleteVideo(videoId)
    throw err
  }
}
