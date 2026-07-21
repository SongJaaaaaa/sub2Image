import { memo, type MutableRefObject } from 'react'
import { Timeline, type TimelineState } from '@xzdarcy/react-timeline-editor'
import { ChevronDownIcon, ChevronLeftIcon, PlusIcon, TrashIcon } from '../../../../components/ui/icons'
import type { BackgroundAudio, ImageOverlay, VideoClip, VideoSource } from '../types'
import { formatTime, getClipFrames } from '../lib/media'
import { getBackgroundLoopCount } from '../lib/audioTimeline'

const AUDIO_ACTION_ID = 'background-audio'
const effects = { clip: { id: 'clip' }, overlay: { id: 'overlay' }, audio: { id: 'audio' } }

function PlayIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.8l10.1-7.2a1 1 0 000-1.6L8.6 4C7.9 3.5 7 4 7 4.8z" /></svg>
}

function PictureIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></svg>
}

function ScissorsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><circle cx="6" cy="7" r="3" /><circle cx="6" cy="17" r="3" /><path d="m8.6 8.5 10.9 6.8M8.6 15.5 19.5 8.7" /></svg>
}

function VolumeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M11 5 6 9H3v6h3l5 4V5zM15 9a4 4 0 010 6M17.7 6.3a8 8 0 010 11.4" /></svg>
}

function TimelineClip({ clip, source, duration, selected }: { clip: VideoClip, source: VideoSource, duration: number, selected: boolean }) {
  const frames = getClipFrames(source.frames, source.duration, clip.sourceStart, clip.sourceEnd)
  return (
    <div className={`video-editor-clip ${selected ? 'selected' : ''}`}>
      <div className="video-editor-clip-frames">{frames.map((frame, idx) => <img key={idx} src={frame} alt="" />)}</div>
      <div className="video-editor-clip-meta"><span>{clip.name}</span><small>{formatTime(duration)}</small></div>
    </div>
  )
}

function TimelineOverlay({ overlay, selected }: { overlay: ImageOverlay, selected: boolean }) {
  return (
    <div className={`video-editor-overlay-clip ${selected ? 'selected' : ''}`}>
      <img src={overlay.url} alt="" />
      <span>{overlay.name}</span>
      <small>{(overlay.end - overlay.start).toFixed(1)}s</small>
    </div>
  )
}

function TimelineAudio({ background, selected }: { background: BackgroundAudio, selected: boolean }) {
  const length = background.timelineEnd - background.timelineStart
  return (
    <div className={`video-editor-audio-clip ${selected ? 'selected' : ''}`}>
      <VolumeIcon />
      <span>{background.name}</span>
      <small>{getBackgroundLoopCount(background) > 1 ? `循环 ${getBackgroundLoopCount(background)} 次` : `${length.toFixed(1)}s`}</small>
    </div>
  )
}

type Props = {
  timelineRef: MutableRefObject<TimelineState | null>
  clips: VideoClip[]
  sources: VideoSource[]
  overlays: ImageOverlay[]
  background: BackgroundAudio | null
  starts: Map<string, number>
  duration: number
  selectedId: string
  selectedOverlayId: string
  selectedAudio: boolean
  activeStart?: number
  activeEnd?: number
  time: number
  onSeek: (value: number) => void
  onSelectClip: (id: string) => void
  onSelectOverlay: (id: string) => void
  onSelectAudio: () => void
  onClipsChange: (clips: VideoClip[]) => void
  onOverlaysChange: (overlays: ImageOverlay[]) => void
  onBackgroundChange: (background: BackgroundAudio) => void
  onSplit: () => void
  onRemove: () => void
  onMoveClip: (offset: number) => void
  onAddImage: () => void
  onAddVideo: () => void
}

function VideoTimeline({ timelineRef, clips, sources, overlays, background, starts, duration, selectedId, selectedOverlayId, selectedAudio, activeStart, activeEnd, time, onSeek, onSelectClip, onSelectOverlay, onSelectAudio, onClipsChange, onOverlaysChange, onBackgroundChange, onSplit, onRemove, onMoveClip, onAddImage, onAddVideo }: Props) {
  const selectedIdx = clips.findIndex((clip) => clip.id === selectedId)
  const editorData = [
    ...[...overlays].reverse().map((overlay) => ({
      id: `overlay-track-${overlay.id}`,
      actions: [{ id: overlay.id, start: overlay.start, end: overlay.end, effectId: 'overlay', selected: overlay.id === selectedOverlayId, flexible: true, movable: true }],
    })),
    {
      id: 'video-track',
      actions: clips.map((clip) => {
        const start = starts.get(clip.id) || 0
        return { id: clip.id, start, end: start + clip.sourceEnd - clip.sourceStart, effectId: 'clip', selected: clip.id === selectedId, flexible: true, movable: true }
      }),
    },
    ...(background ? [{
      id: 'audio-track',
      actions: [{ id: AUDIO_ACTION_ID, start: background.timelineStart, end: background.timelineEnd, effectId: 'audio', selected: selectedAudio, flexible: true, movable: true }],
    }] : []),
  ]

  return (
    <div className="video-editor-timeline-wrap">
      <div className="video-editor-timeline-toolbar">
        <div>
          <button type="button" title="分割片段" disabled={activeStart == null || time <= activeStart + 0.1 || time >= (activeEnd || 0) - 0.1} onClick={onSplit}><ScissorsIcon /></button>
          <button type="button" title={selectedAudio ? '删除背景音乐' : selectedOverlayId ? '删除图片层' : '删除所选片段'} disabled={!selectedId && !selectedOverlayId && !selectedAudio} onClick={onRemove}><TrashIcon className="h-4 w-4" /></button>
          <button type="button" title="片段前移" disabled={selectedIdx <= 0} onClick={() => onMoveClip(-1)}><ChevronLeftIcon className="h-4 w-4" /></button>
          <button type="button" title="片段后移" disabled={selectedIdx < 0 || selectedIdx >= clips.length - 1} onClick={() => onMoveClip(1)}><ChevronDownIcon className="h-4 w-4 -rotate-90" /></button>
        </div>
        <span>{clips.length} 个片段 · {overlays.length} 个图片层 · {background ? '1 条音乐 · ' : ''}{duration.toFixed(1)} 秒</span>
      </div>
      <div className="video-editor-track">
        <div className="video-editor-track-labels">
          <div className="video-editor-track-label-spacer" />
          {[...overlays].reverse().map((overlay, idx) => <div key={overlay.id} className="video-editor-track-label"><PictureIcon /><span>图片层 {overlays.length - idx}</span></div>)}
          <div className="video-editor-track-label"><PlayIcon /><span>视频轨道</span></div>
          {background && <div className="video-editor-track-label"><VolumeIcon /><span>背景音乐</span></div>}
        </div>
        <Timeline
          ref={timelineRef}
          editorData={editorData}
          effects={effects}
          style={{ width: '100%', height: 50 + (overlays.length + 1 + (background ? 1 : 0)) * 72 }}
          rowHeight={72}
          scale={duration > 120 ? 10 : duration > 40 ? 5 : 1}
          scaleWidth={duration > 120 ? 100 : 80}
          scaleSplitCount={5}
          minScaleCount={8}
          gridSnap
          dragLine
          onChange={() => false}
          onClickTimeArea={(value) => { onSeek(value); return true }}
          onCursorDrag={onSeek}
          onClickAction={(_, params) => {
            if (params.action.id === AUDIO_ACTION_ID) {
              onSelectAudio()
              onSeek(params.time)
              return
            }
            const overlay = overlays.find((item) => item.id === params.action.id)
            if (overlay) onSelectOverlay(overlay.id)
            else onSelectClip(params.action.id)
            onSeek(params.time)
          }}
          onActionMoving={({ start, end }) => start >= 0 && end <= duration}
          onActionMoveEnd={({ action, start }) => {
            if (action.id === AUDIO_ACTION_ID && background) {
              const length = background.timelineEnd - background.timelineStart
              onBackgroundChange({ ...background, timelineStart: start, timelineEnd: start + length })
              onSelectAudio()
              onSeek(start)
              return
            }
            const overlay = overlays.find((item) => item.id === action.id)
            if (overlay) {
              const length = overlay.end - overlay.start
              onOverlaysChange(overlays.map((item) => item.id === action.id ? { ...item, start, end: start + length } : item))
              onSelectOverlay(action.id)
              onSeek(start)
              return
            }
            const ordered = [...clips].sort((a, b) => (a.id === action.id ? start : starts.get(a.id) || 0) - (b.id === action.id ? start : starts.get(b.id) || 0))
            onClipsChange(ordered)
            onSelectClip(action.id)
          }}
          onActionResizing={({ action, start, end, dir }) => {
            if (action.id === AUDIO_ACTION_ID) return end - start >= 0.1 && start >= 0 && end <= duration
            const overlay = overlays.find((item) => item.id === action.id)
            if (overlay) return end - start >= 0.1 && start >= 0 && end <= duration
            const clip = clips.find((item) => item.id === action.id)
            if (!clip) return false
            const oldStart = starts.get(clip.id) || 0
            const oldEnd = oldStart + clip.sourceEnd - clip.sourceStart
            if (end - start < 0.1) return false
            return dir === 'left'
              ? clip.sourceStart + start - oldStart >= 0
              : clip.sourceEnd + end - oldEnd <= sources.find((source) => source.id === clip.sourceId)!.duration
          }}
          onActionResizeEnd={({ action, start, end, dir }) => {
            if (action.id === AUDIO_ACTION_ID && background) {
              onBackgroundChange({ ...background, timelineStart: start, timelineEnd: end })
              onSelectAudio()
              onSeek(start)
              return
            }
            const overlay = overlays.find((item) => item.id === action.id)
            if (overlay) {
              onOverlaysChange(overlays.map((item) => item.id === action.id ? { ...item, start, end } : item))
              onSelectOverlay(action.id)
              onSeek(start)
              return
            }
            const clip = clips.find((item) => item.id === action.id)
            if (!clip) return
            const oldStart = starts.get(clip.id) || 0
            const oldEnd = oldStart + clip.sourceEnd - clip.sourceStart
            onClipsChange(clips.map((item) => item.id !== action.id ? item : dir === 'left'
              ? { ...item, sourceStart: item.sourceStart + start - oldStart }
              : { ...item, sourceEnd: item.sourceEnd + end - oldEnd }))
            onSelectClip(action.id)
            onSeek(dir === 'left' ? oldStart : start)
          }}
          getActionRender={(action) => {
            if (action.id === AUDIO_ACTION_ID && background) return <TimelineAudio background={background} selected={Boolean(action.selected)} />
            const overlay = overlays.find((item) => item.id === action.id)
            if (overlay) return <TimelineOverlay overlay={overlay} selected={Boolean(action.selected)} />
            const clip = clips.find((item) => item.id === action.id)
            if (!clip) return null
            const source = sources.find((item) => item.id === clip.sourceId)!
            return <TimelineClip clip={clip} source={source} duration={action.end - action.start} selected={Boolean(action.selected)} />
          }}
        />
        <div className="video-editor-track-additions">
          <button type="button" className="video-editor-add-clip" onClick={onAddImage}><PictureIcon />添加图片层</button>
          <button type="button" className="video-editor-add-clip" onClick={onAddVideo}><PlusIcon className="h-4 w-4" />添加片段</button>
          {background && <div className="video-editor-track-additions-spacer" />}
        </div>
      </div>
    </div>
  )
}

export default memo(VideoTimeline)
