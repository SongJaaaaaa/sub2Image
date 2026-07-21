import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type SVGProps } from 'react'
import type { TimelineState } from '@xzdarcy/react-timeline-editor'
import { DownloadIcon, ImportIcon, PlusIcon } from '../../../components/ui/icons'
import { notifyTool } from '../../adapters/notifications'
import { saveEditedToolVideo } from '../../adapters/videoStorage'
import type { BackgroundAudio, ExportQuality, ExportRatio, ImageOverlay, ImportStatus as ImportStatusData, VideoClip, VideoSource } from './types'
import { cancelVideoExport, exportVideo, getExportSize } from './lib/exportVideo'
import { formatSize, formatTime, getClipAtTime, getClipStarts, getProjectDuration, readMediaInfo, readVideoFrames, readVideoPoster } from './lib/media'
import { useVideoPlayback } from './hooks/useVideoPlayback'
import { getBackgroundSourceTime } from './lib/audioTimeline'
import BackgroundAudioSettings from './components/BackgroundAudioSettings'
import ImportStatus from './components/ImportStatus'
import OverlaySettings from './components/OverlaySettings'
import VideoStage from './components/VideoStage'
import VideoTimeline from './components/VideoTimeline'
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css'
import './videoEditor.css'

let id = 0
const createId = () => `video-${Date.now().toString(36)}-${(id += 1).toString(36)}`

function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.8l10.1-7.2a1 1 0 000-1.6L8.6 4C7.9 3.5 7 4 7 4.8z" /></svg>
}

function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
}

function VolumeIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M11 5 6 9H3v6h3l5 4V5zM15 9a4 4 0 010 6M17.7 6.3a8 8 0 010 11.4" /></svg>
}

function PictureIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></svg>
}

function SaveIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>
}

export default function VideoEditorTool() {
  const [sources, setSources] = useState<VideoSource[]>([])
  const [clips, setClips] = useState<VideoClip[]>([])
  const [overlays, setOverlays] = useState<ImageOverlay[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [selectedOverlayId, setSelectedOverlayId] = useState('')
  const [selectedAudio, setSelectedAudio] = useState(false)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [background, setBackground] = useState<BackgroundAudio | null>(null)
  const [ratio, setRatio] = useState<ExportRatio>('16:9')
  const [quality, setQuality] = useState<ExportQuality>('720p')
  const [exporting, setExporting] = useState(false)
  const [exportTarget, setExportTarget] = useState<'download' | 'gallery' | null>(null)
  const [progress, setProgress] = useState(0)
  const [importStatus, setImportStatus] = useState<ImportStatusData | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const timelineRef = useRef<TimelineState>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const urlsRef = useRef<string[]>([])
  const cancelledRef = useRef(false)
  const syncCursor = useCallback((value: number) => timelineRef.current?.setTime(value), [])
  const playback = useVideoPlayback({ clips, sources, volume, muted, onTimeChange: syncCursor })
  const time = playback.time
  const playing = playback.playing
  const duration = playback.duration
  const active = playback.active
  const seekTo = playback.seekTo
  const starts = useMemo(() => getClipStarts(clips), [clips])
  const selected = clips.find((clip) => clip.id === selectedId)
  const selectedOverlay = overlays.find((overlay) => overlay.id === selectedOverlayId)
  const selectedIdx = clips.findIndex((clip) => clip.id === selectedId)
  const size = getExportSize(ratio, quality)
  const loading = Boolean(importStatus)

  useEffect(() => () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    cancelVideoExport()
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !background) return
    const target = getBackgroundSourceTime(background, time)
    audio.volume = background.volume
    if (target == null) {
      audio.pause()
      return
    }
    if (Math.abs(audio.currentTime - target) > 0.4) audio.currentTime = target
    if (playing) void audio.play()
    else audio.pause()
  }, [background, duration, playing, time])

  useEffect(() => {
    setBackground((current) => {
      if (!current || !duration || current.timelineEnd <= duration) return current
      const timelineStart = Math.min(current.timelineStart, Math.max(0, duration - 0.1))
      return { ...current, timelineStart, timelineEnd: duration }
    })
  }, [duration])

  const addVideos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    const fileProgress = files.map(() => 0)
    setImportStatus({ label: `正在读取 ${files[0].name}`, progress: 0 })
    try {
      const items = await Promise.all(files.map(async (file, idx) => {
        const url = URL.createObjectURL(file)
        urlsRef.current.push(url)
        try {
          const meta = await readMediaInfo(file, url, 'video')
          fileProgress[idx] = 0.08
          const frames = await readVideoFrames(url, meta.duration, (value) => {
            fileProgress[idx] = 0.08 + value * 0.92
            setImportStatus({
              label: `正在生成 ${file.name} 的时间轴`,
              progress: fileProgress.reduce((total, item) => total + item, 0) / files.length,
            })
          })
          const id = createId()
          return { id, file, url, name: file.name, frames, ...meta }
        } catch (err) {
          URL.revokeObjectURL(url)
          urlsRef.current = urlsRef.current.filter((item) => item !== url)
          throw err
        }
      }))
      const newClips = items.map((source) => ({
        id: createId(),
        sourceId: source.id,
        name: source.name,
        sourceStart: 0,
        sourceEnd: source.duration,
      }))
      setSources((current) => [...current, ...items])
      setClips((current) => [...current, ...newClips])
      setSelectedId(newClips[0].id)
      setSelectedOverlayId('')
      setSelectedAudio(false)
    } catch (err) {
      console.error('读取视频失败', files.map((file) => ({ name: file.name, type: file.type, size: file.size })), err)
      notifyTool(`视频读取失败：${err instanceof Error ? err.message : '请更换文件重试'}`, 'error')
    } finally {
      setImportStatus(null)
    }
  }

  const addImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length || !duration) return
    setImportStatus({ label: '正在添加图片层', progress: 0.25 })
    try {
      const start = time >= duration - 0.1 ? Math.max(0, duration - 3) : time
      const items = await Promise.all(files.map(async (file) => {
        const url = URL.createObjectURL(file)
        urlsRef.current.push(url)
        const meta = await new Promise<{ width: number, height: number }>((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
          image.onerror = () => reject(new Error('图片格式无法读取'))
          image.src = url
        })
        return {
          id: createId(),
          file,
          url,
          name: file.name,
          sourceWidth: meta.width,
          sourceHeight: meta.height,
          start,
          end: Math.min(duration, start + 3),
          x: 0.3,
          y: 0.25,
          width: 0.4,
          rotation: 0,
          opacity: 1,
        }
      }))
      setOverlays((current) => [...current, ...items])
      setSelectedOverlayId(items[items.length - 1].id)
      setSelectedId('')
      setSelectedAudio(false)
      seekTo(start)
    } catch (err) {
      console.error('读取遮盖图片失败', err)
      notifyTool(`图片读取失败：${err instanceof Error ? err.message : '请更换图片重试'}`, 'error')
    } finally {
      setImportStatus(null)
    }
  }

  const addBackground = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const url = URL.createObjectURL(file)
    urlsRef.current.push(url)
    try {
      const meta = await readMediaInfo(file, url, 'audio')
      if (background) {
        URL.revokeObjectURL(background.url)
        urlsRef.current = urlsRef.current.filter((item) => item !== background.url)
      }
      setBackground({
        file,
        url,
        name: file.name,
        duration: meta.duration,
        sourceStart: 0,
        sourceEnd: meta.duration,
        timelineStart: 0,
        timelineEnd: duration,
        volume: 0.5,
      })
      setSelectedAudio(true)
      setSelectedId('')
      setSelectedOverlayId('')
      seekTo(0)
    } catch (err) {
      URL.revokeObjectURL(url)
      console.error('读取背景音乐失败', err)
      notifyTool(`音频读取失败：${err instanceof Error ? err.message : '请更换文件重试'}`, 'error')
    }
  }

  const removeBackground = () => {
    if (!background) return
    audioRef.current?.pause()
    URL.revokeObjectURL(background.url)
    urlsRef.current = urlsRef.current.filter((item) => item !== background.url)
    setBackground(null)
    setSelectedAudio(false)
  }

  const splitClip = () => {
    const item = getClipAtTime(clips, time)
    if (!item || time <= item.start + 0.1 || time >= item.end - 0.1) return
    const point = item.clip.sourceStart + time - item.start
    const parts = [
      { ...item.clip, sourceEnd: point },
      { ...item.clip, id: createId(), name: `${item.clip.name} 片段`, sourceStart: point },
    ]
    setClips((current) => current.flatMap((clip) => clip.id === item.clip.id ? parts : [clip]))
    setSelectedId(parts[1].id)
    setSelectedAudio(false)
  }

  const removeClip = () => {
    if (!selected) return
    const start = starts.get(selected.id) || 0
    const items = clips.filter((clip) => clip.id !== selected.id)
    const nextDuration = getProjectDuration(items)
    const nextTime = items.length ? Math.min(start, nextDuration - 0.001) : 0
    playback.stop()
    setClips(items)
    setSelectedId(items[selectedIdx]?.id || items[selectedIdx - 1]?.id || '')
    seekTo(nextTime)
  }

  const moveClip = (offset: number) => {
    if (selectedIdx < 0) return
    const next = selectedIdx + offset
    if (next < 0 || next >= clips.length) return
    const items = [...clips]
    const item = items.splice(selectedIdx, 1)[0]
    items.splice(next, 0, item)
    setClips(items)
    seekTo(getClipStarts(items).get(item.id) || 0)
  }

  const removeOverlay = () => {
    if (!selectedOverlay) return
    const idx = overlays.findIndex((overlay) => overlay.id === selectedOverlay.id)
    const items = overlays.filter((overlay) => overlay.id !== selectedOverlay.id)
    setOverlays(items)
    setSelectedOverlayId(items[idx]?.id || items[idx - 1]?.id || '')
  }

  const moveOverlay = (offset: number) => {
    if (!selectedOverlay) return
    const idx = overlays.findIndex((overlay) => overlay.id === selectedOverlay.id)
    const next = idx + offset
    if (next < 0 || next >= overlays.length) return
    const items = [...overlays]
    const item = items.splice(idx, 1)[0]
    items.splice(next, 0, item)
    setOverlays(items)
  }

  const runExport = async (target: 'download' | 'gallery') => {
    if (!clips.length || exporting) return
    cancelledRef.current = false
    setExporting(true)
    setExportTarget(target)
    setProgress(0)
    try {
      const blob = await exportVideo({ sources, clips, overlays, background, originalVolume: volume, muted, ratio, quality }, setProgress)
      const url = URL.createObjectURL(blob)
      const name = `视频剪辑-${Date.now()}.mp4`
      if (target === 'gallery') {
        try {
          const posterDataUrl = await readVideoPoster(url)
          await saveEditedToolVideo(blob, { name, posterDataUrl, duration, ...size })
          notifyTool('视频已保存到画廊', 'success')
        } finally {
          URL.revokeObjectURL(url)
        }
      } else {
        const link = document.createElement('a')
        link.href = url
        link.download = name
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        notifyTool('视频导出完成', 'success')
      }
    } catch (err) {
      if (!cancelledRef.current) {
        console.error('导出视频失败', err)
        notifyTool(`导出失败：${err instanceof Error ? err.message : '请重试'}`, 'error')
      }
    } finally {
      setExporting(false)
      setExportTarget(null)
    }
  }

  if (!sources.length) {
    return (
      <div data-video-editor-tool className="video-editor-empty">
        <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,.mov" multiple hidden onChange={addVideos} />
        {importStatus ? <ImportStatus status={importStatus} /> : <div className="video-editor-empty__icon"><PlayIcon className="h-8 w-8" /></div>}
        <p>本地视频剪辑</p>
        <h2>选择视频开始剪辑</h2>
        <span>支持 MP4、WebM、MOV，文件只在当前浏览器中处理</span>
        <button type="button" disabled={loading} onClick={() => videoInputRef.current?.click()}>
          <ImportIcon className="h-4 w-4" />
          {loading ? '正在读取...' : '导入视频'}
        </button>
      </div>
    )
  }

  return (
    <div data-video-editor-tool className="video-editor-shell">
      <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,.mov" multiple hidden onChange={addVideos} />
      <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={addImages} />
      <input ref={audioInputRef} type="file" accept="audio/*" hidden onChange={addBackground} />
      <audio
        ref={audioRef}
        src={background?.url}
        onTimeUpdate={(event) => {
          if (!background || event.currentTarget.currentTime < background.sourceEnd - 0.03) return
          event.currentTarget.currentTime = background.sourceStart
        }}
        onEnded={(event) => {
          const target = background ? getBackgroundSourceTime(background, time) : null
          if (target == null || !playing) return
          event.currentTarget.currentTime = target
          void event.currentTarget.play()
        }}
      />

      <header className="video-editor-header">
        <div>
          <h2>视频剪辑</h2>
          <span>本地处理</span>
        </div>
        <div className="video-editor-header-actions">
          <button type="button" className="video-editor-save" disabled={exporting || !clips.length} onClick={() => void runExport('gallery')}>
            <SaveIcon className="h-4 w-4" />
            {exportTarget === 'gallery' ? `保存中 ${Math.round(progress * 100)}%` : '保存到画廊'}
          </button>
          <button type="button" className="video-editor-export" disabled={exporting || !clips.length} onClick={() => void runExport('download')}>
            <DownloadIcon className="h-4 w-4" />
            {exportTarget === 'download' ? `导出中 ${Math.round(progress * 100)}%` : '导出 MP4'}
          </button>
        </div>
      </header>

      {exporting && (
        <div className="video-editor-progress">
          <div style={{ width: `${progress * 100}%` }} />
          <button type="button" onClick={() => { cancelledRef.current = true; cancelVideoExport() }}>取消</button>
        </div>
      )}
      {importStatus && <ImportStatus status={importStatus} compact />}

      <div className="video-editor-workspace">
        <aside className="video-editor-media">
          <div className="video-editor-section-title">
            <span>媒体</span>
            <div>
              <button type="button" title="添加图片层" disabled={loading || !duration} onClick={() => imageInputRef.current?.click()}><PictureIcon className="h-4 w-4" /></button>
              <button type="button" title="导入视频" disabled={loading} onClick={() => videoInputRef.current?.click()}><PlusIcon className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="video-editor-media-list">
            {sources.map((source) => (
              <button key={source.id} type="button" className="video-editor-media-item" onClick={() => {
                const clip = { id: createId(), sourceId: source.id, name: source.name, sourceStart: 0, sourceEnd: source.duration }
                setClips((current) => [...current, clip])
                setSelectedId(clip.id)
                setSelectedOverlayId('')
                setSelectedAudio(false)
              }}>
                <span className="video-editor-thumb"><img src={source.frames[0]} alt="" /></span>
                <span className="video-editor-media-copy">
                  <strong>{source.name}</strong>
                  <small>{formatTime(source.duration)} · {source.width}×{source.height}</small>
                  <small>{source.codec} · {formatSize(source.file.size)}</small>
                </span>
                <PlusIcon className="h-4 w-4" />
              </button>
            ))}
            {overlays.length > 0 && <div className="video-editor-media-divider">图片层</div>}
            {overlays.map((overlay, idx) => (
              <button key={overlay.id} type="button" className={`video-editor-media-item ${overlay.id === selectedOverlayId ? 'selected' : ''}`} onClick={() => {
                setSelectedOverlayId(overlay.id)
                setSelectedId('')
                setSelectedAudio(false)
                seekTo(overlay.start)
              }}>
                <span className="video-editor-thumb"><img src={overlay.url} alt="" /></span>
                <span className="video-editor-media-copy">
                  <strong>{overlay.name}</strong>
                  <small>图片层 {idx + 1} · {overlay.start.toFixed(1)}-{overlay.end.toFixed(1)}s</small>
                  <small>{overlay.sourceWidth}×{overlay.sourceHeight} · {formatSize(overlay.file.size)}</small>
                </span>
                <PictureIcon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </aside>

        <main className="video-editor-preview">
          <VideoStage
            clips={clips}
            sources={sources}
            overlays={overlays}
            ratio={ratio}
            selectedOverlayId={selectedOverlayId}
            playback={playback}
            onSelectOverlay={(id) => { setSelectedOverlayId(id); setSelectedId(''); setSelectedAudio(false) }}
            onChangeOverlay={(overlay) => setOverlays((current) => current.map((item) => item.id === overlay.id ? overlay : item))}
          />
          <div className="video-editor-player">
            <button type="button" title={playing ? '暂停' : '播放'} disabled={!clips.length} onClick={playback.togglePlaying}>
              {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
            </button>
            <span>{formatTime(time)} / {formatTime(duration)}</span>
            <input aria-label="播放位置" type="range" min="0" max={duration || 0} step="0.01" value={Math.min(time, duration)} onChange={(event) => seekTo(Number(event.target.value))} />
            <VolumeIcon className="h-4 w-4" />
            <input aria-label="预览音量" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
          </div>
        </main>

        <aside className="video-editor-settings">
          {selectedOverlay && (
            <OverlaySettings
              overlay={selectedOverlay}
              overlays={overlays}
              duration={duration}
              onChange={(overlay) => setOverlays((current) => current.map((item) => item.id === overlay.id ? overlay : item))}
              onRemove={removeOverlay}
              onMoveLayer={moveOverlay}
            />
          )}
          <section>
            <h3>画布</h3>
            <div className="video-editor-segmented">
              {(['16:9', '9:16', '1:1'] as ExportRatio[]).map((item) => <button key={item} type="button" className={ratio === item ? 'active' : ''} onClick={() => setRatio(item)}>{item}</button>)}
            </div>
            <label>分辨率<select value={quality} onChange={(event) => setQuality(event.target.value as ExportQuality)}><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
            <p>{size.width} × {size.height} · 30 fps</p>
          </section>
          <section>
            <h3>原声</h3>
            <label className="video-editor-toggle"><input type="checkbox" checked={!muted} onChange={() => setMuted((value) => !value)} /><span />启用原声</label>
            <label>音量 <b>{Math.round(volume * 100)}%</b><input type="range" min="0" max="1" step="0.01" value={volume} disabled={muted} onChange={(event) => setVolume(Number(event.target.value))} /></label>
          </section>
          <BackgroundAudioSettings
            background={background}
            duration={duration}
            onAdd={() => audioInputRef.current?.click()}
            onChange={setBackground}
            onRemove={removeBackground}
          />
        </aside>
      </div>

      <VideoTimeline
        timelineRef={timelineRef}
        clips={clips}
        sources={sources}
        overlays={overlays}
        background={background}
        starts={starts}
        duration={duration}
        selectedId={selectedId}
        selectedOverlayId={selectedOverlayId}
        selectedAudio={selectedAudio}
        activeStart={active?.start}
        activeEnd={active?.end}
        time={time}
        onSeek={seekTo}
        onSelectClip={(id) => { setSelectedId(id); setSelectedOverlayId(''); setSelectedAudio(false) }}
        onSelectOverlay={(id) => { setSelectedOverlayId(id); setSelectedId(''); setSelectedAudio(false) }}
        onSelectAudio={() => { setSelectedAudio(true); setSelectedId(''); setSelectedOverlayId('') }}
        onClipsChange={setClips}
        onOverlaysChange={setOverlays}
        onBackgroundChange={setBackground}
        onSplit={splitClip}
        onRemove={selectedAudio ? removeBackground : selectedOverlay ? removeOverlay : removeClip}
        onMoveClip={moveClip}
        onAddImage={() => imageInputRef.current?.click()}
        onAddVideo={() => videoInputRef.current?.click()}
      />
    </div>
  )
}
