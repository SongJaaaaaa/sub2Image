import { createPortal } from 'react-dom'
import { getOutputImageLimitForSettings } from '../../lib/paramCompatibility'
import { calculateImageSize, normalizeImageSize, type SizeTier } from '../../lib/size'
import { useStore } from '../../store'
import type { TaskParams } from '../../types'
import { ChevronDownIcon } from '../../components/icons'

function ImageTabIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

function VideoTabIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8.5 5 3.5-5 3.5Z" />
    </svg>
  )
}

type Props = {
  onClose: () => void
  onSaved?: () => void
}

const tiers: SizeTier[] = ['1K', '2K', '4K']
const ratios = [
  { label: '16:9', value: '16:9' },
  { label: '4:3', value: '4:3' },
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '9:16', value: '9:16' },
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
  const setSettings = useStore((state) => state.setSettings)
  const limit = getOutputImageLimitForSettings(settings)
  // 即选即生效：直接写入全局参数，无需保存按钮
  const patch = (next: Partial<TaskParams>) => {
    setParams(next)
    onSaved?.()
  }
  const preset = getSizePreset(params.size)
  const selectRatio = (ratio: string) => {
    const size = calculateImageSize(preset?.tier ?? '1K', ratio)
    if (size) patch({ size })
  }
  const activeProfile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const counts = [1, 2, 3, 4].filter((count) => count <= Math.max(limit, 1))

  return createPortal(
    <div className="cc-settings-overlay" data-composer-settings onClick={onClose}>
      <div className="cc-settings-popover" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="图片设置">
        <div className="cc-settings-tabs" role="tablist" aria-label="生成类型">
          <button type="button" role="tab" aria-selected="true" className="is-active">
            <ImageTabIcon className="h-4 w-4" />
            图片
          </button>
          <button type="button" role="tab" aria-selected="false" disabled title="视频生成即将支持">
            <VideoTabIcon className="h-4 w-4" />
            视频
          </button>
        </div>
        <div className="cc-settings-ratio-row" role="group" aria-label="图像比例">
          {ratios.map((ratio) => {
            const [width, height] = ratio.value.split(':').map(Number)
            const active = preset?.ratio === ratio.value
            return (
              <button
                key={ratio.value}
                type="button"
                className={active ? 'is-active' : ''}
                aria-label={`比例 ${ratio.label}`}
                aria-pressed={active}
                onClick={() => selectRatio(ratio.value)}
              >
                <span className="cc-ratio-icon" aria-hidden="true">
                  <span
                    style={{
                      aspectRatio: `${width} / ${height}`,
                      ...(width >= height ? { width: '100%' } : { height: '100%' }),
                    }}
                  />
                </span>
                <strong>{ratio.label}</strong>
              </button>
            )
          })}
        </div>
        <div className="cc-settings-count-row" role="group" aria-label="生成数量">
          {counts.map((count) => (
            <button
              key={count}
              type="button"
              className={params.n === count ? 'is-active' : ''}
              aria-label={`生成 ${count} 张`}
              aria-pressed={params.n === count}
              onClick={() => patch({ n: count })}
            >
              {count === 1 ? '1x' : `x${count}`}
            </button>
          ))}
        </div>
        {settings.profiles.length > 0 && (
          <div className="cc-settings-model">
            <select
              aria-label="生成模型"
              value={activeProfile?.id ?? ''}
              onChange={(e) => {
                setSettings({ activeProfileId: e.target.value })
                onSaved?.()
              }}
            >
              {settings.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.model || profile.name}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />
          </div>
        )}
        <p className="cc-settings-footnote">
          生成分辨率 <u>{params.size === 'auto' ? '自动' : params.size.replace('x', ' × ')}</u>
        </p>
      </div>
    </div>,
    document.body,
  )
}
