import { TrashIcon } from '../../../../components/ui/icons'
import type { ImageOverlay } from '../types'
import { clamp, resizeOverlay } from '../lib/overlayTransform'

type Props = {
  overlay: ImageOverlay
  overlays: ImageOverlay[]
  duration: number
  onChange: (overlay: ImageOverlay) => void
  onRemove: () => void
  onMoveLayer: (offset: number) => void
}

export default function OverlaySettings({ overlay, overlays, duration, onChange, onRemove, onMoveLayer }: Props) {
  return (
    <section className="video-editor-overlay-settings">
      <div className="video-editor-section-title"><h3>图片层</h3><button type="button" title="删除图片层" onClick={onRemove}><TrashIcon className="h-4 w-4" /></button></div>
      <strong>{overlay.name}</strong>
      <label>开始（秒）<input type="number" min="0" max={overlay.end - 0.1} step="0.1" value={overlay.start.toFixed(1)} onChange={(event) => onChange({ ...overlay, start: Math.min(Number(event.target.value), overlay.end - 0.1) })} /></label>
      <label>结束（秒）<input type="number" min={overlay.start + 0.1} max={duration} step="0.1" value={overlay.end.toFixed(1)} onChange={(event) => onChange({ ...overlay, end: Math.min(duration, Math.max(overlay.start + 0.1, Number(event.target.value))) })} /></label>
      <label>大小 <b>{Math.round(overlay.width * 100)}%</b><input type="range" min="0.08" max="1" step="0.01" value={overlay.width} onChange={(event) => onChange(resizeOverlay(overlay, Number(event.target.value) / overlay.width))} /></label>
      <label>旋转 <b>{overlay.rotation}°</b><input type="range" min="-180" max="180" step="1" value={overlay.rotation} onChange={(event) => onChange({ ...overlay, rotation: Number(event.target.value) })} /></label>
      <label>水平位置 <b>{Math.round(overlay.x * 100)}%</b><input type="range" min="0" max={Math.max(0, 1 - overlay.width)} step="0.01" value={overlay.x} onChange={(event) => onChange({ ...overlay, x: clamp(Number(event.target.value), 0, 1 - overlay.width) })} /></label>
      <label>垂直位置 <b>{Math.round(overlay.y * 100)}%</b><input type="range" min="0" max="0.9" step="0.01" value={overlay.y} onChange={(event) => onChange({ ...overlay, y: Number(event.target.value) })} /></label>
      <label>透明度 <b>{Math.round(overlay.opacity * 100)}%</b><input type="range" min="0.05" max="1" step="0.01" value={overlay.opacity} onChange={(event) => onChange({ ...overlay, opacity: Number(event.target.value) })} /></label>
      <div className="video-editor-layer-actions">
        <button type="button" disabled={overlays[0]?.id === overlay.id} onClick={() => onMoveLayer(-1)}>下移一层</button>
        <button type="button" disabled={overlays[overlays.length - 1]?.id === overlay.id} onClick={() => onMoveLayer(1)}>上移一层</button>
      </div>
      <p>可在画布拖动图片，使用圆形手柄旋转、方形手柄缩放；轨道上可拖动播放区间和调整两端。</p>
    </section>
  )
}
