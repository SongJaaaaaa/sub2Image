import { useState, type ButtonHTMLAttributes } from 'react'

interface Metal3DButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg'
  iconOnly?: boolean
}

const sizes = {
  sm: {
    body: 'min-h-10 px-5 py-2.5 text-sm',
    icon: 'h-10 w-10 [&_svg]:h-4 [&_svg]:w-4',
    ambient: '-inset-4',
    glow: 60,
  },
  md: {
    body: 'min-h-12 px-7 py-3.5 text-sm',
    icon: 'h-12 w-12 [&_svg]:h-5 [&_svg]:w-5',
    ambient: '-inset-6',
    glow: 80,
  },
  lg: {
    body: 'min-h-14 px-9 py-4 text-base',
    icon: 'h-14 w-14 [&_svg]:h-6 [&_svg]:w-6',
    ambient: '-inset-8',
    glow: 100,
  },
}

export function Metal3DButton({
  size = 'md',
  iconOnly = false,
  type = 'button',
  className = '',
  disabled = false,
  children,
  onClick,
  onMouseMove,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  ...props
}: Metal3DButtonProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [clicked, setClicked] = useState(false)
  const config = sizes[size]

  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      className={`metal-3d-button group relative inline-flex touch-manipulation items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 dark:focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      style={{
        transform: pressed ? 'translateY(4px)' : 'translateY(0)',
        transition: 'transform 100ms ease-out',
      }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
        onMouseMove?.(e)
      }}
      onMouseEnter={(e) => {
        if (!disabled) setHovered(true)
        onMouseEnter?.(e)
      }}
      onMouseLeave={(e) => {
        setHovered(false)
        setPressed(false)
        onMouseLeave?.(e)
      }}
      onMouseDown={(e) => {
        if (!disabled) setPressed(true)
        onMouseDown?.(e)
      }}
      onMouseUp={(e) => {
        setPressed(false)
        onMouseUp?.(e)
      }}
      onClick={(e) => {
        setClicked(true)
        window.setTimeout(() => setClicked(false), 500)
        onClick?.(e)
      }}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute ${config.ambient} rounded-full blur-3xl transition-opacity duration-500`}
        style={{
          background: `radial-gradient(160px circle at ${pos.x}px ${pos.y}px, var(--metal-3d-ambient), transparent 60%)`,
          opacity: hovered ? (pressed ? 0.5 : 1) : 0,
        }}
      />

      <span
        className="relative rounded-full p-[3px] transition-shadow duration-100"
        style={{
          background: 'var(--metal-3d-shell)',
          boxShadow: pressed
            ? 'var(--metal-3d-shadow-pressed)'
            : 'var(--metal-3d-shadow)',
        }}
      >
        <span className="relative block overflow-hidden rounded-full p-[2px]">
          <span className="absolute inset-0 rounded-full" style={{ background: 'var(--metal-3d-rim)' }} />
          <span
            className="absolute inset-0 rounded-full transition-opacity duration-150"
            style={{
              background: hovered
                ? `radial-gradient(${config.glow}px circle at ${pos.x}px ${pos.y}px, var(--metal-3d-glow-strong) 0%, var(--metal-3d-glow-mid) 28%, var(--metal-3d-glow-soft) 52%, transparent 72%)`
                : 'transparent',
            }}
          />

          <span
            className={`relative flex items-center justify-center gap-2 overflow-hidden rounded-full font-medium ${iconOnly ? config.icon : config.body}`}
            style={{
              background: 'var(--metal-3d-core)',
              boxShadow: pressed
                ? 'var(--metal-3d-core-shadow-pressed)'
                : 'var(--metal-3d-core-shadow)',
              color: clicked ? 'var(--metal-3d-text-click)' : hovered ? 'var(--metal-3d-text-hover)' : 'var(--metal-3d-text)',
            }}
          >
            <span className="absolute inset-x-0 top-0 h-1/3 rounded-t-full" style={{ background: 'var(--metal-3d-top-highlight)' }} />
            <span className="absolute inset-x-0 bottom-0 h-1/4 rounded-b-full" style={{ background: 'var(--metal-3d-bottom-highlight)' }} />
            <span
              className="relative z-10 flex items-center justify-center gap-2"
              style={{
                transform: clicked ? 'scale(1.18)' : pressed ? 'scale(0.95)' : hovered ? 'scale(1.05)' : 'scale(1)',
                filter: clicked ? 'var(--metal-3d-click-filter)' : 'none',
                transition: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), color 150ms ease-out, filter 150ms ease-out',
              }}
            >
              {children}
            </span>
            <span className="absolute inset-0 rounded-full border" style={{ borderColor: 'var(--metal-3d-core-border)' }} />
            <span
              className="absolute inset-0 rounded-full transition-opacity duration-100"
              style={{ background: 'var(--metal-3d-pressed-overlay)', opacity: pressed ? 1 : 0 }}
            />
          </span>
        </span>
        <span
          className="absolute inset-x-6 top-1 h-px rounded-full"
          style={{ background: 'var(--metal-3d-specular)', opacity: pressed ? 0 : 1 }}
        />
      </span>
    </button>
  )
}
