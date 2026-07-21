import { readRuntimeEnv } from '../../lib/runtimeEnv'

type ProgressHandler = (current: number, total: number, key: string) => void
export type BackgroundRemovalQuality = 'high' | 'standard'

export function normalizeBackgroundRemovalPublicPath(value: string | undefined) {
  const path = readRuntimeEnv(value)
  if (!path) return ''
  return path.endsWith('/') ? path : `${path}/`
}

const publicPath = normalizeBackgroundRemovalPublicPath(import.meta.env.VITE_BACKGROUND_REMOVAL_PUBLIC_PATH)

export async function removeToolBackground(source: Blob, onProgress?: ProgressHandler, quality: BackgroundRemovalQuality = 'high') {
  const { removeBackground } = await import('@imgly/background-removal')
  return removeBackground(source, {
    ...(publicPath ? { publicPath } : {}),
    model: quality === 'high' ? 'isnet' : 'isnet_fp16',
    device: 'cpu',
    output: { format: 'image/png', quality: 1 },
    progress: (key, current, total) => onProgress?.(current, total, key),
  })
}
