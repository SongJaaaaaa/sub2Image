import { useEffect, useState } from 'react'
import { getCachedImage, ensureImageCached, useStore } from '../../../store'
import { createMaskPreviewDataUrl } from '../../../lib/canvasImage'

type Props = {
  imageId: string
  imageIndex: number
  maskImageId?: string | null
}

export default function ChatImageThumb({ imageId, imageIndex, maskImageId }: Props) {
  const [src, setSrc] = useState(() => getCachedImage(imageId) || '')
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)

  useEffect(() => {
    let cancelled = false

    if (maskImageId) {
      Promise.all([ensureImageCached(imageId), ensureImageCached(maskImageId)])
        .then(async ([baseUrl, maskUrl]) => {
          if (!baseUrl || !maskUrl) return baseUrl || ''
          return createMaskPreviewDataUrl(baseUrl, maskUrl)
        })
        .then((url) => {
          if (!cancelled && url) setSrc(url)
        })
        .catch(() => {
          if (!cancelled) setSrc(getCachedImage(imageId) || '')
        })
      return () => { cancelled = true }
    }

    const cached = getCachedImage(imageId)
    if (cached) {
      setSrc(cached)
      return () => { cancelled = true }
    }
    ensureImageCached(imageId).then((url) => {
      if (!cancelled && url) setSrc(url)
    })
    return () => { cancelled = true }
  }, [imageId, maskImageId])

  return (
    <div
      className={`relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-lg shadow-sm transition-opacity hover:opacity-90 ${
        maskImageId ? 'border-2 border-blue-500' : 'border border-gray-200 dark:border-white/[0.08]'
      }`}
      onClick={() => setLightboxImageId(imageId, [imageId])}
    >
      {src ? <img src={src} className="h-full w-full object-cover" alt="" /> : <div className="h-full w-full bg-gray-100 dark:bg-white/[0.04]" />}
      {maskImageId && (
        <span className="pointer-events-none absolute left-1 top-1 z-10 rounded bg-blue-500/90 px-1.5 py-0.5 text-[8px] font-bold leading-none tracking-wider text-white backdrop-blur-sm">
          MASK
        </span>
      )}
      <span className="pointer-events-none absolute bottom-1 left-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-[9px] font-semibold text-white backdrop-blur-sm">
        {imageIndex + 1}
      </span>
    </div>
  )
}
