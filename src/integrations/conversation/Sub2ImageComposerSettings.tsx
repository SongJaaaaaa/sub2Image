import { useState } from 'react'
import { createPortal } from 'react-dom'
import { getOutputImageLimitForSettings } from '../../lib/paramCompatibility'
import { calculateImageSize, normalizeImageSize, type SizeTier } from '../../lib/size'
import { useStore } from '../../store'
import type { TaskParams } from '../../types'
import { ChevronLeftIcon, CloseIcon } from '../../components/icons'
import Select from '../../components/Select'
import { TooltipButton } from '../../components/TooltipButton'

type Props = {
  onClose: () => void
  onSaved?: () => void
}

const tiers: SizeTier[] = ['1K', '2K', '4K']
const ratios = [
  { label: '16:9', direction: '横向', value: '16:9' },
  { label: '4:3', direction: '横向', value: '4:3' },
  { label: '1:1', direction: '方形', value: '1:1' },
  { label: '3:4', direction: '纵向', value: '3:4' },
  { label: '9:16', direction: '纵向', value: '9:16' },
] as const

function getSizePreset(size: string) {
  const current = normalizeImageSize(size)
  for (const tier of tiers) {
    for (const ratio of ratios) {
      if (calculateImageSize(tier, ratio.value) === current) return { tier, ratio: ratio.value }
    }
  }
  return null
}

export default function Sub2ImageComposerSettings({ onClose, onSaved }: Props) {
  const params = useStore((state) => state.params)
  const settings = useStore((state) => state.settings)
  const setParams = useStore((state) => state.setParams)
  const [draft, setDraft] = useState<TaskParams>(() => ({ ...params }))
  const limit = getOutputImageLimitForSettings(settings)
  const patch = (next: Partial<TaskParams>) => setDraft((current) => ({ ...current, ...next }))
  const preset = getSizePreset(draft.size)
  const selectSize = (tier: SizeTier, ratio: string) => {
    const size = calculateImageSize(tier, ratio)
    if (size) patch({ size })
  }

  return createPortal(
    <div className="cc-settings-overlay" data-composer-settings onClick={onClose}>
      <aside className="cc-settings-drawer" onClick={(e) => e.stopPropagation()} aria-label="图片设置">
        <header className="cc-settings-header">
          <button type="button" className="cc-icon-button" aria-label="返回" onClick={onClose}><ChevronLeftIcon className="h-4 w-4" /></button>
          <h2>图片设置</h2>
          <button type="button" className="cc-icon-button" aria-label="关闭设置" onClick={onClose}><CloseIcon className="h-4 w-4" /></button>
        </header>
        <div className="cc-settings-body">
          <section className="cc-settings-size" aria-label="图像尺寸">
            <div className="cc-settings-section-heading">
              <span>图像比例</span>
              <button
                type="button"
                className={draft.size === 'auto' ? 'is-active' : ''}
                aria-pressed={draft.size === 'auto'}
                onClick={() => patch({ size: 'auto' })}
              >
                自动
              </button>
            </div>
            <div className="cc-settings-ratios">
              {ratios.map((ratio) => {
                const [width, height] = ratio.value.split(':').map(Number)
                return (
                  <button
                    key={ratio.value}
                    type="button"
                    className={preset?.ratio === ratio.value ? 'is-active' : ''}
                    aria-label={`${ratio.direction} ${ratio.label}`}
                    aria-pressed={preset?.ratio === ratio.value}
                    onClick={() => selectSize(preset?.tier ?? '1K', ratio.value)}
                  >
                    <span className="cc-ratio-icon" aria-hidden="true">
                      <span
                        style={{
                          aspectRatio: `${width} / ${height}`,
                          // 横向/方形按宽度定高，纵向按高度定宽，确保图标形状真实反映比例
                          ...(width >= height ? { width: '100%' } : { height: '100%' }),
                        }}
                      />
                    </span>
                    <strong>{ratio.label}</strong>
                    <small>{ratio.direction}</small>
                  </button>
                )
              })}
            </div>
            <div className="cc-settings-resolution-heading">
              <span>分辨率</span>
              <output>{draft.size === 'auto' ? '由模型自动决定' : draft.size.replace('x', ' × ')}</output>
            </div>
            <div className="cc-settings-resolutions">
              {tiers.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  className={preset?.tier === tier ? 'is-active' : ''}
                  aria-pressed={preset?.tier === tier}
                  onClick={() => selectSize(tier, preset?.ratio ?? '1:1')}
                >
                  {tier}
                </button>
              ))}
            </div>
          </section>
          <div className="cc-settings-select-field">
            <span>生成数量</span>
            <Select
              ariaLabel="生成数量"
              value={draft.n}
              onChange={(value) => patch({ n: Number(value) })}
              options={Array.from({ length: limit }, (_, index) => ({ label: `${index + 1} 张`, value: index + 1 }))}
              className="cc-settings-select"
            />
          </div>
          <VisualOptionGroup
            label="质量"
            tip="低质量生成最快、费用最低；高质量细节更多，但更慢、费用更高。"
            value={draft.quality}
            options={[
              { label: '自动', value: 'auto' },
              { label: '低', value: 'low' },
              { label: '中', value: 'medium' },
              { label: '高', value: 'high' },
            ]}
            onChange={(value) => patch({ quality: value as TaskParams['quality'] })}
          />
          <VisualOptionGroup
            label="格式"
            value={draft.output_format}
            options={[
              { label: 'PNG', value: 'png' },
              { label: 'JPEG', value: 'jpeg' },
              { label: 'WebP', value: 'webp' },
            ]}
            onChange={(value) => patch({ output_format: value as TaskParams['output_format'] })}
          />
          <VisualOptionGroup
            label="透明背景"
            value={draft.transparent_output ? 'yes' : 'no'}
            options={[
              { label: '关闭', value: 'no', preview: 'transparent-off' },
              { label: '开启', value: 'yes', preview: 'transparent-on' },
            ]}
            onChange={(value) => patch({ transparent_output: value === 'yes' })}
          />
          <label className="cc-settings-field">
            <span>输出压缩（留空使用默认值）</span>
            <input
              type="number"
              min="0"
              max="100"
              value={draft.output_compression ?? ''}
              onChange={(e) => patch({ output_compression: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
          <OptionGroup
            label="审核强度"
            value={draft.moderation}
            options={[{ label: '自动', value: 'auto' }, { label: '低限制', value: 'low' }]}
            onChange={(value) => patch({ moderation: value as TaskParams['moderation'] })}
          />
        </div>
        <footer className="cc-settings-footer">
          <button
            type="button"
            className="cc-settings-save"
            onClick={() => {
              setParams(draft)
              onSaved?.()
              onClose()
            }}
          >
            保存
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}

type VisualPreview = 'transparent-off' | 'transparent-on'

function VisualOptionGroup({
  label,
  tip,
  value,
  options,
  onChange,
}: {
  label: string
  tip?: string
  value: string
  options: Array<{ label: string; value: string; preview?: VisualPreview }>
  onChange: (value: string) => void
}) {
  return (
    <div className="cc-settings-group">
      <div className="cc-settings-group-title">
        <span>{label}</span>
        {tip && (
          <TooltipButton tooltip={tip} className="cc-quality-info-button" wrapperClassName="cc-quality-info">
            <span aria-hidden="true">i</span>
          </TooltipButton>
        )}
      </div>
      <div className="cc-settings-visual-options" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              className={`${active ? 'is-active ' : ''}${option.preview ? '' : 'is-text'}`.trim()}
              aria-label={option.label}
              aria-pressed={active}
              onClick={() => onChange(option.value)}
            >
              {option.preview && (
                <span className={`cc-transparent-preview${option.preview === 'transparent-off' ? ' is-off' : ''}`} aria-hidden="true">
                  <span />
                </span>
              )}
              <strong>{option.label}</strong>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OptionGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ label: string; value: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="cc-settings-group">
      <span>{label}</span>
      <div className="cc-settings-options" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? 'is-active' : ''}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
