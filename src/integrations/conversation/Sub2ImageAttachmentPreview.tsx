import { createPortal } from 'react-dom'
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape'
import { CloseIcon, EditIcon, RefreshIcon } from '../../components/ui/icons'

type Props = {
  src: string
  label: string
  onClose: () => void
  onMask: () => void
  onReplace: () => void
}

export default function Sub2ImageAttachmentPreview({ src, label, onClose, onMask, onReplace }: Props) {
  useCloseOnEscape(true, onClose)

  return createPortal(
    <div className="cc-preview-overlay" data-composer-attachment-preview onClick={onClose}>
      <div className="cc-preview-dialog" role="dialog" aria-modal="true" aria-label={`${label}预览`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cc-icon-button" aria-label="关闭预览" onClick={onClose}>
          <CloseIcon className="h-4 w-4" />
        </button>
        <img src={src} alt={label} />
        <div className="cc-preview-actions">
          <button type="button" className="cc-toolbar-action" aria-label="编辑遮罩" onClick={onMask}>
            <EditIcon />
            <span>编辑遮罩</span>
          </button>
          <button type="button" className="cc-toolbar-action" aria-label="替换图片" onClick={onReplace}>
            <RefreshIcon />
            <span>替换图片</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
