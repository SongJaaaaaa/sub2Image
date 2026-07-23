import type { StoredVideo } from '../../types'
import { getAllVideos, getVideo } from '../../lib/db'

export type ToolVideo = Pick<StoredVideo, 'id' | 'name' | 'mimeType' | 'duration' | 'width' | 'height' | 'createdAt'> & {
  size: number
}

export async function listToolVideos(): Promise<ToolVideo[]> {
  const videos = await getAllVideos()
  return videos
    .map((video) => ({
      id: video.id,
      name: video.name,
      mimeType: video.mimeType,
      duration: video.duration,
      width: video.width,
      height: video.height,
      createdAt: video.createdAt,
      size: video.blob.size,
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function getToolVideo(id: string) {
  const video = await getVideo(id)
  if (!video) return null
  return { ...video, size: video.blob.size }
}
