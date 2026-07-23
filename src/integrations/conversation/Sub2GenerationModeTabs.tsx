type GenerationMode = 'image' | 'video'

type Props = {
  value: GenerationMode
  onChange: (value: GenerationMode) => void
}

export default function Sub2GenerationModeTabs({ value, onChange }: Props) {
  return (
    <div className="cc-settings-tabs" role="group" aria-label="生成类型">
      <button
        type="button"
        className={value === 'image' ? 'is-active' : ''}
        aria-label="生成类型 图片"
        aria-pressed={value === 'image'}
        onClick={() => onChange('image')}
      >
        图片
      </button>
      <button
        type="button"
        className={value === 'video' ? 'is-active' : ''}
        aria-label="生成类型 视频"
        aria-pressed={value === 'video'}
        onClick={() => onChange('video')}
      >
        视频
      </button>
    </div>
  )
}
