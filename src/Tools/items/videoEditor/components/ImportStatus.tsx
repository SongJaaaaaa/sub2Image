import type { ImportStatus as ImportStatusData } from '../types'

export default function ImportStatus({ status, compact = false }: { status: ImportStatusData, compact?: boolean }) {
  return (
    <div className={`video-editor-import-status ${compact ? 'compact' : ''}`} role="status" aria-live="polite">
      <span className="video-editor-import-spinner" />
      <div>
        <strong>{status.label}</strong>
        <span>正在生成时间轴预览 {Math.round(status.progress * 100)}%</span>
        <i><b style={{ width: `${status.progress * 100}%` }} /></i>
      </div>
    </div>
  )
}
