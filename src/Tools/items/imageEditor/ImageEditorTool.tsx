import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon } from '../../../components/ui/icons'
import ToolImageSourcePicker from '../../components/ToolImageSourcePicker'
import { notifyTool } from '../../adapters/notifications'
import { getToolImage, importToolImage } from '../../adapters/imageLibrary'
import { saveEditedToolImage } from '../../adapters/imageStorage'
import { filerobotConfig, getFilerobotTheme } from './filerobotConfig'
import { localizeFilerobotFilters } from './filerobotLocalization'
import './imageEditor.css'

const FilerobotImageEditor = lazy(() => import('react-filerobot-image-editor'))

type Source = {
  id: string
  dataUrl: string
}

export default function ImageEditorTool() {
  const requestedSourceId = new URLSearchParams(window.location.search).get('image')
  const [source, setSource] = useState<Source | null>(null)
  const [busy, setBusy] = useState(Boolean(requestedSourceId))
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const editorRef = useRef<HTMLDivElement>(null)
  const requestedSourceRef = useRef('')

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!source || !editorRef.current) return
    return localizeFilerobotFilters(editorRef.current)
  }, [source])

  const loadSource = useCallback(async (load: () => Promise<Source | null>) => {
    setBusy(true)
    try {
      const image = await load()
      if (!image) throw new Error('图片不存在或已被删除')
      setSource({ id: image.id, dataUrl: image.dataUrl })
    } catch (err) {
      console.error('加载图片编辑源失败', err)
      notifyTool(`图片加载失败：${err instanceof Error ? err.message : '请重试'}`, 'error')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!requestedSourceId || requestedSourceRef.current === requestedSourceId) return
    requestedSourceRef.current = requestedSourceId
    void loadSource(() => getToolImage(requestedSourceId))
  }, [loadSource, requestedSourceId])

  const resetSource = () => {
    setSource(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('image')
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }

  if (!source) {
    return (
      <ToolImageSourcePicker
        eyebrow="专业图片编辑工具"
        title="选择一张图片开始编辑"
        description="支持裁剪、滤镜、文字、水印、旋转和尺寸调整。"
        selectLabel="编辑此图"
        emptyMessage="图片库暂无图片，请先上传一张。"
        busy={busy}
        onUpload={(file) => {
          void loadSource(() => importToolImage(file))
        }}
        onSelect={(id) => {
          void loadSource(() => getToolImage(id))
        }}
      />
    )
  }

  return (
    <div ref={editorRef} data-image-editor-tool className="-mx-4 -mb-4 min-h-[calc(100svh-8rem)] bg-zinc-100 dark:bg-[#111111] md:-mx-6 md:-mb-6">
      <div className="flex h-14 items-center justify-between border-b border-white/10 bg-zinc-950 px-4 text-white">
        <button type="button" onClick={resetSource} className="inline-flex items-center gap-2 text-sm text-white/70 transition hover:text-white">
          <ChevronLeftIcon className="h-4 w-4" />
          返回图片选择
        </button>
        <span className="text-sm font-medium">图片编辑器</span>
        <span className="w-24" />
      </div>
      <div className="h-[calc(100svh-11.5rem)] min-h-[560px]">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-white/60">正在加载图片编辑器...</div>}>
          <FilerobotImageEditor
            {...filerobotConfig}
            theme={getFilerobotTheme(dark)}
            previewBgColor={dark ? '#18181b' : '#f4f4f5'}
            source={source.dataUrl}
            onSave={async (saved) => {
              await document.fonts?.ready
              const dataUrl = saved.imageBase64
              if (!dataUrl) {
                notifyTool('编辑结果为空，无法保存', 'error')
                return
              }
              try {
                await saveEditedToolImage(dataUrl, source.id, {
                  name: saved.name,
                  extension: saved.extension,
                })
                notifyTool('编辑结果已保存到画廊', 'success')
              } catch (err) {
                console.error('保存编辑图片失败', err)
                notifyTool(`保存失败：${err instanceof Error ? err.message : '请重试'}`, 'error')
              }
            }}
            onClose={(reason) => {
              if (reason !== 'after-saving') resetSource()
            }}
          />
        </Suspense>
      </div>
    </div>
  )
}
