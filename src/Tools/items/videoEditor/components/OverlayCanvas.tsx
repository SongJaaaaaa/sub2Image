import { useRef, type PointerEvent } from 'react'
import type { ImageOverlay } from '../types'
import { clamp, getOverlayHeight, getRotation, resizeOverlay } from '../lib/overlayTransform'

type Drag = {
  id: string
  mode: 'move' | 'resize' | 'rotate'
  clientX: number
  clientY: number
  x: number
  y: number
  width: number
  distance: number
  centerX: number
  centerY: number
}

type Props = {
  overlays: ImageOverlay[]
  time: number
  selectedId: string
  onSelect: (id: string) => void
  onChange: (overlay: ImageOverlay) => void
}

export default function OverlayCanvas({ overlays, time, selectedId, onSelect, onChange }: Props) {
  const dragRef = useRef<Drag | null>(null)

  const startTransform = (event: PointerEvent<HTMLElement>, overlay: ImageOverlay, mode: Drag['mode']) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const layer = mode === 'move' ? event.currentTarget : event.currentTarget.parentElement
    if (!layer) return
    const rect = layer.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    dragRef.current = {
      id: overlay.id,
      mode,
      clientX: event.clientX,
      clientY: event.clientY,
      x: overlay.x,
      y: overlay.y,
      width: overlay.width,
      distance: Math.hypot(event.clientX - centerX, event.clientY - centerY),
      centerX,
      centerY,
    }
    onSelect(overlay.id)
  }

  const moveTransform = (event: PointerEvent<HTMLDivElement>, overlay: ImageOverlay) => {
    const drag = dragRef.current
    const stage = event.currentTarget.parentElement
    if (!drag || drag.id !== overlay.id || !stage) return
    const rect = stage.getBoundingClientRect()
    if (drag.mode === 'rotate') {
      onChange({ ...overlay, rotation: getRotation(event.clientX, event.clientY, drag.centerX, drag.centerY) })
      return
    }
    if (drag.mode === 'resize') {
      const distance = Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY)
      onChange(resizeOverlay({ ...overlay, width: drag.width }, distance / Math.max(1, drag.distance)))
      return
    }
    const height = getOverlayHeight(overlay, rect.width, rect.height)
    const x = clamp(drag.x + (event.clientX - drag.clientX) / rect.width, 0, 1 - overlay.width)
    const y = clamp(drag.y + (event.clientY - drag.clientY) / rect.height, 0, 1 - height)
    onChange({ ...overlay, x, y })
  }

  return overlays.map((overlay, idx) => time >= overlay.start && time < overlay.end ? (
    <div
      key={overlay.id}
      className={`video-editor-stage-overlay ${overlay.id === selectedId ? 'selected' : ''}`}
      style={{
        left: `${overlay.x * 100}%`,
        top: `${overlay.y * 100}%`,
        width: `${overlay.width * 100}%`,
        aspectRatio: `${overlay.sourceWidth} / ${overlay.sourceHeight}`,
        opacity: overlay.opacity,
        transform: `rotate(${overlay.rotation}deg)`,
        zIndex: idx + 2,
      }}
      onPointerDown={(event) => startTransform(event, overlay, 'move')}
      onPointerMove={(event) => moveTransform(event, overlay)}
      onPointerUp={() => { dragRef.current = null }}
      onPointerCancel={() => { dragRef.current = null }}
    >
      <img src={overlay.url} alt="" draggable={false} />
      {overlay.id === selectedId && (
        <>
          <button type="button" className="video-editor-overlay-rotate" title="旋转图片" onPointerDown={(event) => startTransform(event, overlay, 'rotate')} />
          <button type="button" className="video-editor-overlay-resize" title="缩放图片" onPointerDown={(event) => startTransform(event, overlay, 'resize')} />
        </>
      )}
    </div>
  ) : null)
}
