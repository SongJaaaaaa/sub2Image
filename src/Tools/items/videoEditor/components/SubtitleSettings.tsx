import { TrashIcon } from '../../../../components/ui/icons'
import type { SubtitleCue, SubtitleStyle } from '../types'

type Props = {
  cue?: SubtitleCue
  count: number
  duration: number
  style: SubtitleStyle
  onChangeCue: (cue: SubtitleCue) => void
  onChangeStyle: (style: SubtitleStyle) => void
  onRemove: () => void
  onClear: () => void
}

export default function SubtitleSettings({ cue, count, duration, style, onChangeCue, onChangeStyle, onRemove, onClear }: Props) {
  return (
    <section className="video-editor-subtitle-settings">
      <div className="video-editor-section-title">
        <h3>字幕</h3>
        <span>{count} 条</span>
      </div>
      {cue && (
        <>
          <textarea aria-label="字幕文字" value={cue.text} onChange={(event) => onChangeCue({ ...cue, text: event.target.value })} />
          <div className="video-editor-subtitle-times">
            <label>开始<input aria-label="字幕开始时间" type="number" min="0" max={Math.max(0, cue.end - 0.05)} step="0.1" value={cue.start} onChange={(event) => onChangeCue({ ...cue, start: Math.min(Number(event.target.value), cue.end - 0.05) })} /></label>
            <label>结束<input aria-label="字幕结束时间" type="number" min={cue.start + 0.05} max={duration} step="0.1" value={cue.end} onChange={(event) => onChangeCue({ ...cue, end: Math.min(duration, Math.max(Number(event.target.value), cue.start + 0.05)) })} /></label>
          </div>
        </>
      )}
      <label>字号 <b>{style.fontSize}px</b><input aria-label="字幕字号" type="range" min="24" max="72" step="1" value={style.fontSize} onChange={(event) => onChangeStyle({ ...style, fontSize: Number(event.target.value) })} /></label>
      <label>文字颜色<input aria-label="字幕文字颜色" type="color" value={style.color} onChange={(event) => onChangeStyle({ ...style, color: event.target.value })} /></label>
      <label>背景 <b>{Math.round(style.backgroundOpacity * 100)}%</b><input aria-label="字幕背景透明度" type="range" min="0" max="0.9" step="0.05" value={style.backgroundOpacity} onChange={(event) => onChangeStyle({ ...style, backgroundOpacity: Number(event.target.value) })} /></label>
      <div className="video-editor-subtitle-position">
        {([
          ['top', '顶部'],
          ['middle', '居中'],
          ['bottom', '底部'],
        ] as const).map(([value, label]) => <button key={value} type="button" className={style.position === value ? 'active' : ''} onClick={() => onChangeStyle({ ...style, position: value })}>{label}</button>)}
      </div>
      <div className="video-editor-subtitle-actions">
        <button type="button" disabled={!cue} onClick={onRemove}><TrashIcon />删除当前</button>
        <button type="button" onClick={onClear}>清空字幕</button>
      </div>
    </section>
  )
}
