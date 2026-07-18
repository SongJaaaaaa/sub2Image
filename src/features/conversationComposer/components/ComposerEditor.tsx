import { forwardRef, useEffect, useImperativeHandle, useRef, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'

export type ComposerEditorPart = {
  text: string
  value?: string
}

type Props = {
  value: string
  parts?: readonly ComposerEditorPart[]
  placeholder: string
  ariaLabel: string
  clearAriaLabel?: string
  enterSubmit: boolean
  canSubmit: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onPasteFiles?: (files: File[]) => void
  onCursorChange?: (cursor: number) => void
  onKeyCommand?: (event: KeyboardEvent<HTMLDivElement>) => boolean
  overlay?: ReactNode
}

export type ComposerEditorHandle = {
  focus: (cursor?: number) => void
  getCursor: () => number
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

function readEditorValue(el: HTMLElement) {
  let value = ''

  const append = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      value += node.textContent ?? ''
      return
    }
    if (node instanceof HTMLElement && node.dataset.composerValue != null) {
      value += node.dataset.composerValue
      return
    }
    node.childNodes.forEach(append)
  }

  el.childNodes.forEach(append)
  return value.replace(/\r\n?/g, '\n')
}

function insertText(el: HTMLElement, text: string) {
  el.focus()
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  const target = range && el.contains(range.commonAncestorContainer) ? range : null

  if (!target) {
    el.appendChild(document.createTextNode(text))
    return
  }

  target.deleteContents()
  const node = document.createTextNode(text)
  target.insertNode(node)
  target.setStartAfter(node)
  target.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(target)
}

function getEditorCursor(el: HTMLElement) {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return el.textContent?.length ?? 0
  const range = selection.getRangeAt(0)
  if (!el.contains(range.startContainer)) return el.textContent?.length ?? 0
  const before = range.cloneRange()
  before.selectNodeContents(el)
  before.setEnd(range.startContainer, range.startOffset)
  return before.toString().length
}

function setEditorCursor(el: HTMLElement, cursor: number) {
  const selection = window.getSelection()
  if (!selection) return
  let remaining = cursor

  const place = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text
      if (remaining > text.length) {
        remaining -= text.length
        return false
      }
      const range = document.createRange()
      range.setStart(text, Math.max(0, remaining))
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    }

    const atom = node instanceof HTMLElement && node.dataset.composerValue != null ? node : null
    if (atom) {
      const length = atom.textContent?.length ?? 0
      if (remaining > length) {
        remaining -= length
        return false
      }
      const range = document.createRange()
      if (remaining < length / 2) range.setStartBefore(atom)
      else range.setStartAfter(atom)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    }

    return Array.from(node.childNodes).some(place)
  }

  if (place(el)) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

const ComposerEditor = forwardRef<ComposerEditorHandle, Props>(function ComposerEditor({
  value,
  parts = [{ text: value }],
  placeholder,
  ariaLabel,
  clearAriaLabel = '清空输入',
  enterSubmit,
  canSubmit,
  onChange,
  onSubmit,
  onPasteFiles,
  onCursorChange,
  onKeyCommand,
  overlay,
}, ref) {
  const editorRef = useRef<HTMLDivElement>(null)
  const userInputRef = useRef(false)
  const composingRef = useRef(false)

  useImperativeHandle(ref, () => ({
    focus: (cursor) => {
      const el = editorRef.current
      if (!el) return
      el.focus()
      if (cursor != null) setEditorCursor(el, cursor)
    },
    getCursor: () => editorRef.current ? getEditorCursor(editorRef.current) : 0,
  }), [])

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (userInputRef.current) {
      userInputRef.current = false
      return
    }

    const html = parts.map((part) => part.value == null
      ? escapeHtml(part.text)
      : `<span contenteditable="false" data-composer-value="${escapeHtml(part.value)}" class="cc-atom">${escapeHtml(part.text)}</span>`
    ).join('')
    if (el.innerHTML !== html) el.innerHTML = html
  }, [parts, value])

  const syncValue = () => {
    const el = editorRef.current
    if (!el) return
    userInputRef.current = true
    onChange(readEditorValue(el))
    onCursorChange?.(getEditorCursor(el))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) return
    if (onKeyCommand?.(e)) return
    if (e.key !== 'Enter') return

    e.preventDefault()
    const isModifier = e.ctrlKey || e.metaKey
    const shouldSubmit = enterSubmit ? !e.shiftKey && !isModifier : isModifier
    if (shouldSubmit) {
      if (canSubmit) onSubmit()
      return
    }

    if (enterSubmit && isModifier) return
    const el = editorRef.current
    if (!el) return
    insertText(el, '\n')
    syncValue()
  }

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .flatMap((item) => item.getAsFile() ? [item.getAsFile()!] : [])
    if (files.length) {
      e.preventDefault()
      onPasteFiles?.(files)
      return
    }

    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    e.preventDefault()
    const el = editorRef.current
    if (!el) return
    insertText(el, text.replace(/\r\n?/g, '\n'))
    syncValue()
  }

  return (
    <div className="cc-editor-shell">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-composer-editor
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        onInput={syncValue}
        onSelect={() => {
          const el = editorRef.current
          if (el) onCursorChange?.(getEditorCursor(el))
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={() => {
          const el = editorRef.current
          if (el) onCursorChange?.(getEditorCursor(el))
        }}
        onPaste={handlePaste}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => {
          composingRef.current = false
          syncValue()
        }}
        onClick={(e) => {
          const atom = (e.target as HTMLElement).closest<HTMLElement>('[data-composer-value]')
          if (!atom) return
          const selection = window.getSelection()
          if (!selection) return
          const range = document.createRange()
          range.selectNode(atom)
          selection.removeAllRanges()
          selection.addRange(range)
          onCursorChange?.(getEditorCursor(editorRef.current!))
        }}
        className="cc-editor"
      />
      {!value && (
        <div className="cc-editor-placeholder">
          {placeholder}
        </div>
      )}
      {value && (
        <button
          type="button"
          aria-label={clearAriaLabel}
          title="清空"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange('')}
          className="cc-editor-clear"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      )}
      {overlay}
    </div>
  )
})

export default ComposerEditor
