import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import Select from '../../../components/ui/Select'
import { TooltipButton } from '../../../components/ui/TooltipButton'
import { CopyIcon, DownloadIcon, ImportIcon, StopIcon } from '../../../components/ui/icons'
import {
  cancelMediaTranscription,
  createMediaTranscription,
  getMediaTranscription,
  MediaApiError,
  type SubtitleSegment,
  type TranscriptionJob,
} from '../../adapters/mediaApi'
import { notifyTool } from '../../adapters/notifications'
import { getToolVideo, listToolVideos, type ToolVideo } from '../../adapters/videoLibrary'
import { toPlainText, toSrt, toVtt } from './subtitleFormat'
import './subtitleRecognition.css'

type VideoSource = {
  blob: Blob
  name: string
  mimeType: string
  size: number
  duration?: number
  width?: number
  height?: number
}

const JOB_KEY = 'subtitle-recognition-job-id'
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_VIDEO_SIZE = 600 * 1024 * 1024

const STATUS_LABELS: Record<TranscriptionJob['status'], string> = {
  queued: '等待识别',
  running: '正在识别人声',
  succeeded: '识别完成',
  failed: '识别失败',
  canceled: '已取消',
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(duration?: number) {
  if (duration === undefined) return ''
  const minutes = Math.floor(duration / 60)
  const seconds = Math.floor(duration % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function SubtitleRecognitionTool() {
  const [source, setSource] = useState<VideoSource | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [videos, setVideos] = useState<ToolVideo[]>([])
  const [showLibrary, setShowLibrary] = useState(false)
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [language, setLanguage] = useState('')
  const [job, setJob] = useState<TranscriptionJob | null>(null)
  const [segments, setSegments] = useState<SubtitleSegment[]>([])
  const [uploading, setUploading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')
  const urlRef = useRef('')
  const uploadRef = useRef<AbortController | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const active = job?.status === 'queued' || job?.status === 'running'
  const activeId = active ? job.id : ''

  useEffect(() => {
    listToolVideos()
      .then(setVideos)
      .catch((err) => console.error('读取本地视频库失败', err))
      .finally(() => setLibraryLoading(false))
  }, [])

  useEffect(() => {
    const id = window.localStorage.getItem(JOB_KEY)
    if (!id) return
    const ctrl = new AbortController()
    setRestoring(true)
    getMediaTranscription(id, ctrl.signal)
      .then((next) => {
        setJob(next)
        if (next.segments) setSegments(next.segments)
      })
      .catch((err) => {
        if (err instanceof MediaApiError && err.status === 404) window.localStorage.removeItem(JOB_KEY)
        else if ((err as { name?: string }).name !== 'AbortError') setError(err instanceof Error ? err.message : '任务恢复失败')
      })
      .finally(() => setRestoring(false))
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    if (!activeId) return
    let polling = true
    let timer = 0
    const ctrl = new AbortController()
    const poll = async () => {
      let next: TranscriptionJob | null = null
      try {
        next = await getMediaTranscription(activeId, ctrl.signal)
        if (!polling) return
        setJob(next)
        if (next.segments) setSegments(next.segments)
        setError('')
      } catch (err) {
        if (!polling || (err as { name?: string }).name === 'AbortError') return
        setError(err instanceof Error ? err.message : '任务状态获取失败')
      }
      if (polling && (!next || next.status === 'queued' || next.status === 'running')) {
        timer = window.setTimeout(poll, 2000)
      }
    }
    timer = window.setTimeout(poll, 1000)
    return () => {
      polling = false
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [activeId])

  useEffect(() => () => {
    uploadRef.current?.abort()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  const selectSource = (next: VideoSource) => {
    if (uploading || active) return
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(next.blob)
    urlRef.current = url
    setPreviewUrl(url)
    setSource(next)
    setShowLibrary(false)
    setJob(null)
    setSegments([])
    setError('')
    window.localStorage.removeItem(JOB_KEY)
  }

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!VIDEO_TYPES.includes(file.type)) {
      setError('请选择 MP4、WebM 或 MOV 视频')
      return
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setError('视频文件不能超过 600MB')
      return
    }
    selectSource({ blob: file, name: file.name, mimeType: file.type, size: file.size })
  }

  const selectLibraryVideo = async (id: string) => {
    try {
      const video = await getToolVideo(id)
      if (!video) throw new Error('视频不存在或已被删除')
      selectSource({
        blob: video.blob,
        name: video.name,
        mimeType: video.mimeType,
        size: video.size,
        duration: video.duration,
        width: video.width,
        height: video.height,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '视频加载失败')
    }
  }

  const start = async () => {
    if (!source) return
    const ctrl = new AbortController()
    uploadRef.current = ctrl
    setUploading(true)
    setError('')
    try {
      const next = await createMediaTranscription(source.blob, source.name, language, ctrl.signal)
      setJob(next)
      setSegments([])
      window.localStorage.setItem(JOB_KEY, next.id)
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') setError(err instanceof Error ? err.message : '字幕任务创建失败')
    } finally {
      if (uploadRef.current === ctrl) {
        uploadRef.current = null
        setUploading(false)
      }
    }
  }

  const cancel = async () => {
    if (uploading) {
      uploadRef.current?.abort()
      uploadRef.current = null
      setUploading(false)
      return
    }
    if (!job) return
    try {
      await cancelMediaTranscription(job.id)
      setJob({ ...job, status: 'canceled' })
      window.localStorage.removeItem(JOB_KEY)
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消任务失败')
    }
  }

  const updateSegment = (id: number, key: 'start' | 'end' | 'text', value: string) => {
    setSegments((items) => items.map((item) => item.id === id
      ? { ...item, [key]: key === 'text' ? value : Number(value) }
      : item))
  }

  const seek = (time: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = time
    void videoRef.current.play()
  }

  const download = (format: 'srt' | 'vtt') => {
    const content = format === 'srt' ? toSrt(segments) : toVtt(segments)
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${source?.name.replace(/\.[^.]+$/, '') || 'subtitles'}.${format}`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(toPlainText(segments))
      notifyTool('字幕文字已复制', 'success')
    } catch (err) {
      console.error('复制字幕失败', err)
      notifyTool('复制失败，请重试', 'error')
    }
  }

  const canStart = source && !uploading && !active

  return (
    <div className="subtitle-tool">
      <section className="subtitle-source">
        <div className="subtitle-heading">
          <div>
            <h2>视频来源</h2>
            <p>上传视频或从当前设备的视频库选择</p>
          </div>
          {job && <span className={`subtitle-status subtitle-status-${job.status}`}>{STATUS_LABELS[job.status]}</span>}
        </div>

        <div className="subtitle-source-actions">
          <label className="subtitle-file-button">
            <ImportIcon />
            本地上传
            <input aria-label="上传本地视频" type="file" accept="video/mp4,video/webm,video/quicktime,.mov" disabled={uploading || active} onChange={selectFile} />
          </label>
          <button type="button" className="subtitle-library-button" disabled={uploading || active} onClick={() => setShowLibrary((value) => !value)}>设备视频库</button>
        </div>

        {showLibrary && (
          <div className="subtitle-library" aria-label="设备视频库">
            {libraryLoading ? <p>正在读取视频库...</p> : videos.length ? videos.map((video) => (
              <button type="button" key={video.id} disabled={uploading || active} onClick={() => void selectLibraryVideo(video.id)}>
                <span>{video.name}</span>
                <small>{formatDuration(video.duration)} · {video.width}×{video.height} · {formatSize(video.size)}</small>
              </button>
            )) : <p>当前设备还没有视频</p>}
          </div>
        )}

        <div className="subtitle-preview" data-empty={!previewUrl}>
          {previewUrl ? <video ref={videoRef} src={previewUrl} controls preload="metadata" /> : (
            <div>
              <ImportIcon />
              <span>选择一个视频开始识别</span>
            </div>
          )}
        </div>

        {source && (
          <div className="subtitle-file-info">
            <strong>{source.name}</strong>
            <span>{formatSize(source.size)}{source.duration !== undefined ? ` · ${formatDuration(source.duration)}` : ''}{source.width ? ` · ${source.width}×${source.height}` : ''}</span>
          </div>
        )}

        <label className="subtitle-language">
          <span>识别语言</span>
          <Select
            ariaLabel="识别语言"
            value={language}
            onChange={(value) => setLanguage(String(value))}
            options={[
              { value: '', label: '自动检测' },
              { value: 'zh', label: '中文' },
              { value: 'en', label: '英语' },
              { value: 'ja', label: '日语' },
              { value: 'ko', label: '韩语' },
            ]}
            className="subtitle-language-select"
          />
        </label>

        {error && <p className="subtitle-error" role="alert">{error}</p>}
        {job?.error && <p className="subtitle-error" role="alert">{job.error}</p>}

        <div className="subtitle-task-actions">
          <button type="button" className="subtitle-primary" disabled={!canStart} onClick={() => void start()}>
            {uploading ? '正在上传...' : active ? STATUS_LABELS[job.status] : '开始识别'}
          </button>
          {(uploading || active) && (
            <button type="button" className="subtitle-cancel" onClick={() => void cancel()}>
              <StopIcon />
              取消
            </button>
          )}
        </div>
      </section>

      <section className="subtitle-results">
        <div className="subtitle-heading">
          <div>
            <h2>字幕校对</h2>
            <p>{restoring ? '正在恢复上次任务...' : segments.length ? `${segments.length} 条字幕${job?.language ? ` · ${job.language}` : ''}` : '识别完成后可修改时间和文字'}</p>
          </div>
          {segments.length > 0 && (
            <div className="subtitle-export-actions">
              <TooltipButton
                tooltip="SRT：通用字幕格式，适合剪映、Premiere 和多数播放器"
                className="subtitle-export-button"
                onClick={() => download('srt')}
              >
                <DownloadIcon />SRT
              </TooltipButton>
              <TooltipButton
                tooltip="VTT：网页字幕格式，适合 HTML5 视频和网站播放器"
                className="subtitle-export-button"
                onClick={() => download('vtt')}
              >
                <DownloadIcon />VTT
              </TooltipButton>
              <button type="button" onClick={() => void copyText()} title="复制纯文本"><CopyIcon />复制</button>
            </div>
          )}
        </div>

        <div className="subtitle-segments" data-empty={!segments.length}>
          {segments.length ? segments.map((segment, idx) => (
            <article key={segment.id} className="subtitle-segment" onClick={() => seek(segment.start)}>
              <span className="subtitle-index">{idx + 1}</span>
              <div className="subtitle-segment-fields">
                <div className="subtitle-times" onClick={(event) => event.stopPropagation()}>
                  <label>开始<input aria-label={`第 ${idx + 1} 条开始时间`} type="number" min="0" step="0.1" value={segment.start} onChange={(event) => updateSegment(segment.id, 'start', event.target.value)} /></label>
                  <span>→</span>
                  <label>结束<input aria-label={`第 ${idx + 1} 条结束时间`} type="number" min="0" step="0.1" value={segment.end} onChange={(event) => updateSegment(segment.id, 'end', event.target.value)} /></label>
                </div>
                <textarea aria-label={`第 ${idx + 1} 条字幕`} value={segment.text} onClick={(event) => event.stopPropagation()} onChange={(event) => updateSegment(segment.id, 'text', event.target.value)} />
              </div>
            </article>
          )) : (
            <div className="subtitle-empty">
              <span>00:00</span>
              <p>暂无字幕结果</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
