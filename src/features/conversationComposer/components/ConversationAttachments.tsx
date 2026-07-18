import { useRef, useState, type DragEvent, type KeyboardEvent, type TouchEvent } from 'react'

export type ConversationAttachmentItem = {
  id: string
  label: string
  previewUrl: string
  badge?: string
  editLabel?: string
}

type Props = {
  items: readonly ConversationAttachmentItem[]
  onPreview?: (id: string, index: number) => void
  onEdit?: (id: string, index: number) => void
  onReplace?: (id: string, index: number) => void
  onRemove?: (id: string, index: number) => void
  onMove?: (fromIndex: number, toIndex: number) => void
}

export default function ConversationAttachments({ items, onPreview, onRemove, onMove }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const touchRef = useRef({ from: -1, to: -1, startX: 0, startY: 0 })

  const moveByKeyboard = (e: KeyboardEvent, index: number) => {
    if (!e.altKey || !onMove) return
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      onMove(index, index - 1)
    }
    if (e.key === 'ArrowRight' && index < items.length - 1) {
      e.preventDefault()
      onMove(index, index + 2)
    }
  }

  const handleDrop = (e: DragEvent, index: number) => {
    if (dragIndex == null || !onMove) return
    e.preventDefault()
    e.stopPropagation()
    onMove(dragIndex, dragIndex < index ? index + 1 : index)
    setDragIndex(null)
  }

  const handleTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch || touchRef.current.from < 0) return
    if (Math.abs(touch.clientX - touchRef.current.startX) <= Math.abs(touch.clientY - touchRef.current.startY)) return
    const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest<HTMLElement>('[data-composer-attachment-index]')
    if (!target) return
    const index = Number(target.dataset.composerAttachmentIndex)
    if (!Number.isInteger(index)) return
    if (e.cancelable) e.preventDefault()
    touchRef.current.to = index
  }

  const handleTouchEnd = () => {
    const touch = touchRef.current
    touchRef.current = { from: -1, to: -1, startX: 0, startY: 0 }
    if (!onMove || touch.from < 0 || touch.to < 0 || touch.from === touch.to) return
    onMove(touch.from, touch.from < touch.to ? touch.to + 1 : touch.to)
  }

  if (!items.length) return null

  return (
    <div data-conversation-attachments className="cc-attachments">
      {items.map((item, index) => (
        <div
          key={item.id}
          data-composer-attachment-index={index}
          draggable={Boolean(onMove)}
          tabIndex={0}
          onKeyDown={(e) => moveByKeyboard(e, index)}
          onDragStart={(e) => {
            setDragIndex(index)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            if (dragIndex != null) e.preventDefault()
          }}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={() => setDragIndex(null)}
          onTouchStart={(e) => {
            const touch = e.touches[0]
            if (!touch) return
            touchRef.current = { from: index, to: index, startX: touch.clientX, startY: touch.clientY }
          }}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => {
              touchRef.current = { from: -1, to: -1, startX: 0, startY: 0 }
            }}
          style={{ width: 40, height: 40 }}
          className={`cc-attachment${dragIndex === index ? ' cc-attachment--dragging' : ''}`}
        >
          <button
            type="button"
            aria-label={`预览${item.label}`}
            onClick={() => onPreview?.(item.id, index)}
            className="cc-attachment-preview"
          >
            <img src={item.previewUrl} alt={item.label} draggable={false} />
          </button>
          {item.badge && (
            <span className="cc-attachment-badge">
              {item.badge}
            </span>
          )}
          <div className="cc-attachment-actions">
            {onRemove && (
              <button type="button" aria-label={`移除${item.label}`} title="移除" onClick={() => onRemove(item.id, index)} className="cc-attachment-action">
                <span aria-hidden="true">&times;</span>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
