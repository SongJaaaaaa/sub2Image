import { useCallback, useEffect, useState } from 'react'
import { ChevronLeftIcon, DownloadIcon, EditIcon, ExportIcon, ImportIcon, RefreshIcon, TransparentBgIcon } from '../../../components/ui/icons'
import { navigateToExtensionWorkspace } from '../../../ExtensionWorkspace/extensionRoutes'
import { blobToDataUrl, fileToDataUrl } from '../../../lib/dataUrl'
import { downloadImageIds } from '../../../lib/downloadImages'
import { composeToolBackground } from '../../adapters/backgroundComposition'
import { refineToolEdges } from '../../adapters/edgeRefinement'
import { getToolImage, importToolImage } from '../../adapters/imageLibrary'
import { removeToolBackground, type BackgroundRemovalQuality } from '../../adapters/backgroundRemoval'
import { saveEditedToolImage } from '../../adapters/imageStorage'
import { notifyTool } from '../../adapters/notifications'
import ToolImageSourcePicker from '../../components/ToolImageSourcePicker'
import './backgroundRemover.css'

type Source = {
  id: string
  dataUrl: string
}

type Result = {
  dataUrl: string
}

type BackgroundType = 'transparent' | 'white' | 'black' | 'red' | 'blue' | 'custom' | 'image'
type PreviewBackground = 'checkerboard' | 'white' | 'black'

const BACKGROUND_COLORS: Partial<Record<BackgroundType, string>> = {
  white: '#ffffff',
  black: '#09090b',
  red: '#ef4444',
  blue: '#3b82f6',
}

const COLOR_BACKGROUNDS = [
  { type: 'white' as const, label: '白色', color: BACKGROUND_COLORS.white },
  { type: 'black' as const, label: '黑色', color: BACKGROUND_COLORS.black },
  { type: 'red' as const, label: '红色', color: BACKGROUND_COLORS.red },
  { type: 'blue' as const, label: '蓝色', color: BACKGROUND_COLORS.blue },
]

const EDGE_PRESETS = [
  { id: 'original', label: '原始边缘', shift: 0, feather: 0, decontaminate: 0 },
  { id: 'hair', label: '毛发细节', shift: -4, feather: 0, decontaminate: 20 },
  { id: 'clean', label: '商品净边', shift: 10, feather: 1, decontaminate: 60 },
]

export default function BackgroundRemoverTool() {
  const [source, setSource] = useState<Source | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('transparent')
  const [customColor, setCustomColor] = useState('#f3f4f6')
  const [backgroundImage, setBackgroundImage] = useState('')
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>('checkerboard')
  const [output, setOutput] = useState('')
  const [composing, setComposing] = useState(false)
  const [outputStage, setOutputStage] = useState('')
  const [quality, setQuality] = useState<BackgroundRemovalQuality>('high')
  const [edgeShift, setEdgeShift] = useState(-4)
  const [edgeFeather, setEdgeFeather] = useState(0)
  const [edgeDecontaminate, setEdgeDecontaminate] = useState(20)

  const loadSource = useCallback(async (load: () => Promise<Source | null>) => {
    setBusy(true)
    try {
      const image = await load()
      if (!image) throw new Error('图片不存在或已被删除')
      setSource({ id: image.id, dataUrl: image.dataUrl })
      setResult(null)
      setOutput('')
      setBackgroundType('transparent')
      setBackgroundImage('')
      setPreviewBackground('checkerboard')
      setEdgeShift(-4)
      setEdgeFeather(0)
      setEdgeDecontaminate(20)
    } catch (err) {
      console.error('加载抠图源失败', err)
      notifyTool(`图片加载失败：${err instanceof Error ? err.message : '请重试'}`, 'error')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!result) {
      setOutput('')
      setComposing(false)
      return
    }
    const needsRefinement = edgeShift !== 0 || edgeFeather !== 0 || edgeDecontaminate !== 0
    if (backgroundType === 'transparent' && !needsRefinement) {
      setOutput(result.dataUrl)
      setComposing(false)
      return
    }

    const background = backgroundType === 'image'
      ? backgroundImage ? { type: 'image' as const, value: backgroundImage } : null
      : { type: 'color' as const, value: backgroundType === 'custom' ? customColor : BACKGROUND_COLORS[backgroundType] || '#ffffff' }
    if (backgroundType !== 'transparent' && !background) return

    let active = true
    setOutput('')
    setComposing(true)
    setOutputStage(needsRefinement ? '正在优化边缘...' : '正在合成背景...')
    const timer = window.setTimeout(() => {
      void (async () => {
        const foreground = needsRefinement
          ? await refineToolEdges(result.dataUrl, {
              shift: edgeShift,
              feather: edgeFeather,
              decontaminate: edgeDecontaminate,
            })
          : result.dataUrl
        if (!background) return foreground
        if (active) setOutputStage('正在合成背景...')
        return composeToolBackground(foreground, background)
      })()
      .then((dataUrl) => {
        if (active) setOutput(dataUrl)
      })
      .catch((err) => {
        console.error('合成抠图背景失败', err)
        if (active) notifyTool(`背景合成失败：${err instanceof Error ? err.message : '请重试'}`, 'error')
      })
      .finally(() => {
        if (active) setComposing(false)
      })
    }, 120)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [backgroundImage, backgroundType, customColor, edgeDecontaminate, edgeFeather, edgeShift, result])

  const removeBackground = async () => {
    if (!source) return
    setBusy(true)
    setProgress(0)
    setStage(quality === 'high' ? '正在加载高清抠图模型，首次使用需要一点时间...' : '正在加载抠图模型，首次使用需要一点时间...')
    try {
      const blob = await (await fetch(source.dataUrl)).blob()
      const removed = await removeToolBackground(blob, (current, total) => {
        if (total > 0) setProgress(Math.min(100, Math.round((current / total) * 100)))
        setStage('正在识别主体并处理边缘...')
      }, quality)
      const dataUrl = await blobToDataUrl(removed, 'image/png')
      setResult({ dataUrl })
      setStage('抠图完成')
    } catch (err) {
      console.error('抠图失败', err)
      notifyTool(`抠图失败：${err instanceof Error ? err.message : '请重试'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveResult = async () => {
    if (!source || !output) return
    setBusy(true)
    try {
      await saveEditedToolImage(output, source.id, {
        name: '抠图结果',
        extension: 'png',
        taskPrompt: '抠图结果',
      })
      notifyTool('抠图结果已保存到画廊', 'success')
    } catch (err) {
      console.error('保存抠图结果失败', err)
      notifyTool(`保存失败：${err instanceof Error ? err.message : '请重试'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const downloadResult = async () => {
    if (!output) return
    const downloaded = await downloadImageIds([output], '抠图结果')
    if (downloaded.failCount) notifyTool('下载失败，请重试', 'error')
  }

  const continueEditing = async () => {
    if (!source || !output) return
    setBusy(true)
    try {
      const saved = await saveEditedToolImage(output, source.id, {
        name: '抠图结果',
        extension: 'png',
        taskPrompt: '抠图结果',
      })
      navigateToExtensionWorkspace('tools', 'image-editor', { image: saved.id })
    } catch (err) {
      console.error('打开图片编辑器失败', err)
      notifyTool(`打开编辑器失败：${err instanceof Error ? err.message : '请重试'}`, 'error')
      setBusy(false)
    }
  }

  const importBackground = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      notifyTool('请选择图片文件', 'error')
      return
    }
    try {
      setBackgroundImage(await fileToDataUrl(file))
      setBackgroundType('image')
    } catch (err) {
      console.error('读取背景图片失败', err)
      notifyTool(`背景图片读取失败：${err instanceof Error ? err.message : '请重试'}`, 'error')
    }
  }

  if (!source) {
    return (
      <ToolImageSourcePicker
        busy={busy}
        eyebrow="本地智能抠图"
        title="选择一张图片开始抠图"
        description="自动识别主体，保留毛发和细节，输出透明背景 PNG。"
        selectLabel="抠这张图"
        emptyMessage="图片库暂无图片，请先上传一张。"
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
    <div data-background-remover-tool className="-mx-4 -mb-4 min-h-[calc(100svh-8rem)] bg-zinc-100 dark:bg-[#111111] md:-mx-6 md:-mb-6">
      <div className="flex h-14 items-center justify-between border-b border-white/10 bg-zinc-950 px-4 text-white">
        <button type="button" onClick={() => { setSource(null); setResult(null); setOutput('') }} className="inline-flex items-center gap-2 text-sm text-white/70 transition hover:text-white">
          <ChevronLeftIcon className="h-4 w-4" />
          返回图片选择
        </button>
        <span className="text-sm font-medium">一键抠图</span>
        <span className="w-24" />
      </div>

      <div className="mx-auto flex min-h-[calc(100svh-11.5rem)] max-w-5xl flex-col gap-5 p-5 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-950 dark:text-white">{result ? '透明背景预览' : '准备处理图片'}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{result ? '检查边缘、设置输出背景，然后保存或继续编辑。' : 'AI 会自动识别主体，不需要手动描边。'}</p>
          </div>
          {!result && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">抠图质量</span>
              <div className="inline-flex rounded-lg border border-border bg-sidebar p-1 dark:border-white/[0.12] dark:bg-gray-900">
                {([
                  ['high', '高清细节'],
                  ['standard', '标准快速'],
                ] as const).map(([type, label]) => (
                  <button key={type} type="button" disabled={busy} onClick={() => setQuality(type)} className={`h-8 rounded-md px-3 text-xs transition ${quality === type ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 hover:bg-muted dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}>{label}</button>
                ))}
              </div>
              <button type="button" disabled={busy} onClick={() => void removeBackground()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-pink-500 px-4 text-sm font-medium text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50">
                开始抠图
              </button>
            </div>
          )}
          {result && (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
              <button type="button" disabled={busy || composing || !output} onClick={() => void saveResult()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-pink-500 px-4 text-sm font-medium text-white transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50">
                <ExportIcon className="h-4 w-4" />
                保存到画廊
              </button>
              <button type="button" disabled={busy || composing || !output} onClick={() => void downloadResult()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-sidebar px-4 text-sm text-gray-700 transition hover:bg-muted disabled:opacity-50 dark:border-white/[0.12] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]">
                <DownloadIcon className="h-4 w-4" />
                下载 PNG
              </button>
              <button type="button" disabled={busy || composing || !output} onClick={() => void continueEditing()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-sidebar px-4 text-sm text-gray-700 transition hover:bg-muted disabled:opacity-50 dark:border-white/[0.12] dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.06]">
                <EditIcon className="h-4 w-4" />
                继续编辑
              </button>
              <button type="button" disabled={busy} onClick={() => { setResult(null); setOutput('') }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm text-gray-700 transition hover:bg-muted disabled:opacity-50 dark:border-white/[0.12] dark:text-gray-200 dark:hover:bg-white/[0.06]">
                <RefreshIcon className="h-4 w-4" />
                重新处理
              </button>
            </div>
          )}
        </div>

        {result && (
          <div className="flex flex-col gap-4 border-y border-border py-4 dark:border-white/[0.1] lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-medium text-gray-700 dark:text-gray-200">输出背景</span>
              <button type="button" title="透明背景" aria-label="透明背景" onClick={() => setBackgroundType('transparent')} className={`background-swatch checkerboard ${backgroundType === 'transparent' ? 'background-swatch-active' : ''}`}>
                <TransparentBgIcon className="h-4 w-4" />
              </button>
              {COLOR_BACKGROUNDS.map((background) => (
                <button key={background.type} type="button" title={`${background.label}背景`} aria-label={`${background.label}背景`} onClick={() => setBackgroundType(background.type)} className={`background-swatch ${backgroundType === background.type ? 'background-swatch-active' : ''}`} style={{ backgroundColor: background.color }} />
              ))}
              <label title="自定义背景颜色" className={`background-swatch cursor-pointer overflow-hidden ${backgroundType === 'custom' ? 'background-swatch-active' : ''}`} style={{ backgroundColor: customColor }}>
                <input type="color" value={customColor} aria-label="自定义背景颜色" className="h-full w-full cursor-pointer opacity-0" onChange={(event) => { setCustomColor(event.target.value); setBackgroundType('custom') }} />
              </label>
              <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition hover:bg-muted dark:hover:bg-white/[0.06] ${backgroundType === 'image' ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-border text-gray-700 dark:border-white/[0.12] dark:text-gray-200'}`}>
                <ImportIcon className="h-4 w-4" />
                上传背景图
                <input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackground(file); event.currentTarget.value = '' }} />
              </label>
              {composing && <span className="text-xs text-gray-500 dark:text-gray-400">{outputStage}</span>}
            </div>

            {backgroundType === 'transparent' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">透明区域预览</span>
                <div className="inline-flex rounded-lg border border-border bg-sidebar p-1 dark:border-white/[0.12] dark:bg-gray-900">
                  {([
                    ['checkerboard', '网格'],
                    ['white', '白底'],
                    ['black', '黑底'],
                  ] as const).map(([type, label]) => (
                    <button key={type} type="button" onClick={() => setPreviewBackground(type)} className={`h-7 rounded-md px-3 text-xs transition ${previewBackground === type ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 hover:bg-muted dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}>{label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="border-b border-border pb-4 dark:border-white/[0.1]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">边缘优化</span>
              <div className="inline-flex rounded-lg border border-border bg-sidebar p-1 dark:border-white/[0.12] dark:bg-gray-900">
                {EDGE_PRESETS.map((preset) => {
                  const active = edgeShift === preset.shift && edgeFeather === preset.feather && edgeDecontaminate === preset.decontaminate
                  return (
                    <button key={preset.id} type="button" onClick={() => { setEdgeShift(preset.shift); setEdgeFeather(preset.feather); setEdgeDecontaminate(preset.decontaminate) }} className={`h-7 rounded-md px-3 text-xs transition ${active ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 hover:bg-muted dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}>{preset.label}</button>
                  )
                })}
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="block min-w-0">
                <span className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>边缘范围</span>
                  <span>{edgeShift < 0 ? `扩展 ${-edgeShift}` : edgeShift > 0 ? `收紧 ${edgeShift}` : '原始'}</span>
                </span>
                <input type="range" min="-20" max="20" value={edgeShift} onChange={(event) => setEdgeShift(Number(event.target.value))} className="mt-2 w-full accent-pink-500" />
              </label>
              <label className="block min-w-0">
                <span className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>边缘柔化</span>
                  <span>{edgeFeather} px</span>
                </span>
                <input type="range" min="0" max="3" value={edgeFeather} onChange={(event) => setEdgeFeather(Number(event.target.value))} className="mt-2 w-full accent-pink-500" />
              </label>
              <label className="block min-w-0">
                <span className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>去除色边</span>
                  <span>{edgeDecontaminate}%</span>
                </span>
                <input type="range" min="0" max="100" step="10" value={edgeDecontaminate} onChange={(event) => setEdgeDecontaminate(Number(event.target.value))} className="mt-2 w-full accent-pink-500" />
              </label>
            </div>
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <PreviewPanel title="原图" src={source.dataUrl} />
          <PreviewPanel title="输出预览" src={output || result?.dataUrl} background={backgroundType === 'transparent' ? previewBackground : 'neutral'} />
        </div>

        {busy && !result && (
          <div className="rounded-xl border border-border bg-sidebar p-4 dark:border-white/[0.1] dark:bg-gray-900">
            <div className="flex items-center justify-between gap-4 text-sm text-gray-600 dark:text-gray-300">
              <span>{stage}</span>
              <span>{progress ? `${progress}%` : '处理中'}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-full rounded-full bg-pink-500 transition-[width]" style={{ width: `${Math.max(progress, 5)}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewPanel({ title, src, background = 'neutral' }: { title: string; src?: string; background?: PreviewBackground | 'neutral' }) {
  const backgroundClass = background === 'checkerboard'
    ? 'checkerboard'
    : background === 'black'
      ? 'bg-zinc-950'
      : background === 'white'
        ? 'bg-white'
        : 'bg-gray-100 dark:bg-gray-800'

  return (
    <div className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-border bg-sidebar dark:border-white/[0.1] dark:bg-gray-900">
      <div className="border-b border-border px-4 py-3 text-sm font-medium text-gray-800 dark:border-white/[0.08] dark:text-gray-200">{title}</div>
      <div className={`flex min-h-0 flex-1 items-center justify-center p-4 ${backgroundClass}`}>
        {src ? <img src={src} alt={`${title}图片`} className="max-h-[60vh] max-w-full object-contain" /> : <span className="text-sm text-gray-400">等待处理</span>}
      </div>
    </div>
  )
}
