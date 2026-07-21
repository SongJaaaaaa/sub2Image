import { useEffect, useRef, useState } from 'react'
import { ImportIcon, PlusIcon } from '../../components/ui/icons'
import type { ToolImage } from '../adapters/imageLibrary'
import { listToolImages } from '../adapters/imageLibrary'

type Props = {
  onUpload: (file: File) => void
  onSelect: (id: string) => void
  busy: boolean
  eyebrow: string
  title: string
  description: string
  selectLabel: string
  emptyMessage: string
}

export default function ToolImageSourcePicker({ onUpload, onSelect, busy, eyebrow, title, description, selectLabel, emptyMessage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<ToolImage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void listToolImages().then((items) => {
      if (active) setImages(items)
    }).catch((err) => {
      console.warn('加载图片库失败', err)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <div data-image-source-picker className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-pink-500">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">{title}</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200"
        >
          <ImportIcon className="h-4 w-4" />
          上传图片
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onUpload(file)
            event.target.value = ''
          }}
        />
      </div>

      <div className="mt-8 border-t border-border pt-6 dark:border-white/[0.08]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">现有图片</h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">{images.length} 张</span>
        </div>
        {loading ? (
          <div className="mt-5 text-sm text-gray-500 dark:text-gray-400">正在加载图片库...</div>
        ) : images.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {images.map((image) => (
              <button
                key={image.id}
                type="button"
                disabled={busy}
                onClick={() => onSelect(image.id)}
                className="group overflow-hidden rounded-xl border border-border bg-sidebar text-left transition hover:border-pink-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-gray-900"
              >
                <span className="block aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800">
                  <img src={image.thumbnailDataUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-2 text-xs text-gray-500 dark:text-gray-400">
                  <PlusIcon className="h-3.5 w-3.5 text-pink-500" />
                  {selectLabel}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-gray-500 dark:border-white/[0.12] dark:text-gray-400">{emptyMessage}</div>
        )}
      </div>
    </div>
  )
}
