import type { AppMode } from '../types'

interface AiLiquidModeSwitchProps {
  value: AppMode
  onChange: (mode: AppMode) => void
  className?: string
}

export function AiLiquidModeSwitch({ value, onChange, className = '' }: AiLiquidModeSwitchProps) {
  return (
    <div
      role="group"
      aria-label="工作区模式"
      className={`ai-liquid-mode-switch relative grid h-10 grid-cols-2 rounded-full p-1 ${className}`}
    >
      <span
        aria-hidden
        className="ai-liquid-mode-switch__thumb pointer-events-none absolute left-1 top-1 h-8 w-[calc(50%-4px)] rounded-full transition-transform duration-300 ease-out"
        style={{ transform: value === 'agent' ? 'translateX(100%)' : 'translateX(0)' }}
      />
      <button
        type="button"
        aria-pressed={value === 'gallery'}
        onClick={() => onChange('gallery')}
        className={`relative z-10 flex h-8 min-w-0 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:focus-visible:outline-zinc-400 ${value === 'gallery' ? 'font-medium text-zinc-950' : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}`}
      >
        画廊
      </button>
      <button
        type="button"
        aria-pressed={value === 'agent'}
        onClick={() => onChange('agent')}
        className={`relative z-10 flex h-8 min-w-0 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:focus-visible:outline-zinc-400 ${value === 'agent' ? 'font-medium text-zinc-950' : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'}`}
      >
        对话
      </button>
    </div>
  )
}
