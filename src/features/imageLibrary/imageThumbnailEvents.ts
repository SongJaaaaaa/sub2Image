export type ImageThumbnail = {
  dataUrl: string
  width?: number
  height?: number
  thumbnailVersion?: number
}

const subscribers = new Map<string, Set<(thumbnail: ImageThumbnail) => void>>()

export function subscribeImageThumbnail(id: string, callback: (thumbnail: ImageThumbnail) => void) {
  const current = subscribers.get(id)
  const items = current ?? new Set<(thumbnail: ImageThumbnail) => void>()
  if (!current) subscribers.set(id, items)
  items.add(callback)
  return () => {
    items.delete(callback)
    if (!items.size) subscribers.delete(id)
  }
}

export function notifyImageThumbnail(id: string, thumbnail: ImageThumbnail) {
  subscribers.get(id)?.forEach((callback) => callback(thumbnail))
}

export function clearImageThumbnailSubscribers(id: string) {
  subscribers.delete(id)
}
