import { PlusIcon, TrashIcon } from '../../../../components/ui/icons'
import type { BackgroundAudio } from '../types'
import { getBackgroundLoopCount } from '../lib/audioTimeline'

type Props = {
  background: BackgroundAudio | null
  duration: number
  onAdd: () => void
  onChange: (background: BackgroundAudio) => void
  onRemove: () => void
}

export default function BackgroundAudioSettings({ background, duration, onAdd, onChange, onRemove }: Props) {
  return (
    <section>
      <div className="video-editor-section-title"><h3>背景音乐</h3>{background && <button type="button" title="移除背景音乐" onClick={onRemove}><TrashIcon className="h-4 w-4" /></button>}</div>
      {!background ? (
        <button type="button" className="video-editor-audio-add" onClick={onAdd}><PlusIcon className="h-4 w-4" />添加音乐</button>
      ) : (
        <div className="video-editor-audio-controls">
          <strong>{background.name}</strong>
          <label>音乐起点（秒）<input type="number" min="0" max={background.sourceEnd - 0.1} step="0.1" value={background.sourceStart.toFixed(1)} onChange={(event) => onChange({ ...background, sourceStart: Math.min(Number(event.target.value), background.sourceEnd - 0.1) })} /></label>
          <label>音乐终点（秒）<input type="number" min={background.sourceStart + 0.1} max={background.duration} step="0.1" value={background.sourceEnd.toFixed(1)} onChange={(event) => onChange({ ...background, sourceEnd: Math.min(background.duration, Math.max(background.sourceStart + 0.1, Number(event.target.value))) })} /></label>
          <label>轨道开始（秒）<input type="number" min="0" max={background.timelineEnd - 0.1} step="0.1" value={background.timelineStart.toFixed(1)} onChange={(event) => onChange({ ...background, timelineStart: Math.min(Number(event.target.value), background.timelineEnd - 0.1) })} /></label>
          <label>轨道结束（秒）<input type="number" min={background.timelineStart + 0.1} max={duration} step="0.1" value={background.timelineEnd.toFixed(1)} onChange={(event) => onChange({ ...background, timelineEnd: Math.min(duration, Math.max(background.timelineStart + 0.1, Number(event.target.value))) })} /></label>
          <label>音量 <b>{Math.round(background.volume * 100)}%</b><input type="range" min="0" max="1" step="0.01" value={background.volume} onChange={(event) => onChange({ ...background, volume: Number(event.target.value) })} /></label>
          <p>{getBackgroundLoopCount(background) > 1 ? `轨道超出音乐长度，将循环拼接 ${getBackgroundLoopCount(background)} 次` : '音乐将在轨道区间内播放'}</p>
        </div>
      )}
    </section>
  )
}
