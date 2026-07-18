import { useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import ComposerEditor, { type ComposerEditorHandle, type ComposerEditorPart } from './ComposerEditor'

type Props = {
  ownerId: string
  className?: string
  value: string
  editorParts?: readonly ComposerEditorPart[]
  placeholder: string
  editorAriaLabel: string
  clearAriaLabel?: string
  attachAriaLabel?: string
  submitAriaLabel?: string
  stopAriaLabel?: string
  enterSubmit: boolean
  canSubmit: boolean
  submitEnabled?: boolean
  running?: boolean
  attachments?: ReactNode
  toolSlot?: ReactNode
  paramsSlot?: ReactNode
  editorOverlay?: ReactNode
  editorRef?: Ref<ComposerEditorHandle>
  onChange: (value: string) => void
  onSubmit: () => void
  onStop?: () => void
  onAttach?: () => void
  onPasteFiles?: (files: File[]) => void
  onDropData?: (data: DataTransfer) => void
  canHandleDrop?: () => boolean
  onCursorChange?: (cursor: number) => void
  onEditorKeyCommand?: (event: KeyboardEvent<HTMLDivElement>) => boolean
}

export default function ConversationComposer({
  ownerId,
  className,
  value,
  editorParts,
  placeholder,
  editorAriaLabel,
  clearAriaLabel,
  attachAriaLabel = '添加附件',
  submitAriaLabel = '发送',
  stopAriaLabel = '停止',
  enterSubmit,
  canSubmit,
  submitEnabled = canSubmit,
  running = false,
  attachments,
  toolSlot,
  paramsSlot,
  editorOverlay,
  editorRef,
  onChange,
  onSubmit,
  onStop,
  onAttach,
  onPasteFiles,
  onDropData,
  canHandleDrop,
  onCursorChange,
  onEditorKeyCommand,
}: Props) {
  const dragDepthRef = useRef(0)
  const [dragging, setDragging] = useState(false)
  const acceptsDrop = () => canHandleDrop?.() ?? true

  return (
    <section
      data-conversation-composer
      data-no-drag-select
      data-composer-owner={ownerId}
      onDragEnter={(e) => {
        if (!acceptsDrop()) return
        if (!Array.from(e.dataTransfer.types).includes('Files')) return
        e.preventDefault()
        dragDepthRef.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (!acceptsDrop()) return
        if (!Array.from(e.dataTransfer.types).some((type) => type === 'Files' || type === 'text/plain')) return
        e.preventDefault()
      }}
      onDragLeave={(e) => {
        if (!dragging) return
        e.preventDefault()
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (!dragDepthRef.current) setDragging(false)
      }}
      onDrop={(e) => {
        dragDepthRef.current = 0
        setDragging(false)
        if (!acceptsDrop()) return
        e.preventDefault()
        e.stopPropagation()
        onDropData?.(e.dataTransfer)
      }}
      style={{ maxHeight: 'min(400px, calc(100dvh - 24px))' }}
      className={`cc-composer${dragging ? ' cc-composer--dragging' : ''}${className ? ` ${className}` : ''}`}
    >
      {attachments}
      <ComposerEditor
        ref={editorRef}
        value={value}
        parts={editorParts}
        placeholder={placeholder}
        ariaLabel={editorAriaLabel}
        clearAriaLabel={clearAriaLabel}
        enterSubmit={enterSubmit}
        canSubmit={canSubmit}
        onChange={onChange}
        onSubmit={onSubmit}
        onPasteFiles={onPasteFiles}
        onCursorChange={onCursorChange}
        onKeyCommand={onEditorKeyCommand}
        overlay={editorOverlay}
      />
      <div className="cc-toolbar">
        <div className="cc-toolbar-left">
          {onAttach && (
            <button
              type="button"
              aria-label={attachAriaLabel}
              title="添加附件"
              onClick={onAttach}
              className="cc-icon-button cc-attach-button"
            >
              <span aria-hidden="true">+</span>
            </button>
          )}
          {toolSlot && <div className="cc-tool-slot">{toolSlot}</div>}
        </div>
        <div className="cc-toolbar-right">
          {paramsSlot && <div className="cc-params-slot">{paramsSlot}</div>}
          <button
            type="button"
            aria-label={running ? stopAriaLabel : submitAriaLabel}
            title={running ? '停止' : '发送'}
            disabled={!running && !submitEnabled}
            onClick={running ? onStop : onSubmit}
            className={`cc-icon-button cc-submit-button${running ? ' cc-submit-button--running' : ''}`}
          >
            {running ? <span aria-hidden="true" className="cc-stop-icon" /> : <span aria-hidden="true">&rarr;</span>}
          </button>
        </div>
      </div>
    </section>
  )
}
