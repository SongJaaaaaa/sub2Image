import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react'
import type { ShaderMount } from '@paper-design/shaders'

interface AiLiquidButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg'
  iconOnly?: boolean
  idleSpeed?: number
}

interface Ripple {
  id: number
  x: number
  y: number
}

const sizes = {
  sm: {
    button: 'h-10 min-w-[120px] px-5 text-[13px]',
    icon: 'h-10 w-10 [&_svg]:h-4 [&_svg]:w-4',
  },
  md: {
    button: 'h-[46px] min-w-[142px] px-6 text-sm',
    icon: 'h-[46px] w-[46px] [&_svg]:h-4 [&_svg]:w-4',
  },
  lg: {
    button: 'h-[54px] min-w-[170px] px-7 text-[15px]',
    icon: 'h-[54px] w-[54px] [&_svg]:h-5 [&_svg]:w-5',
  },
}

export function AiLiquidButton({
  size = 'md',
  iconOnly = false,
  idleSpeed = 0.6,
  type = 'button',
  className = '',
  disabled = false,
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  ...props
}: AiLiquidButtonProps) {
  const shaderEl = useRef<HTMLDivElement>(null)
  const shader = useRef<ShaderMount | null>(null)
  const buttonEl = useRef<HTMLButtonElement>(null)
  const rippleId = useRef(0)
  const hoveredRef = useRef(false)
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const config = sizes[size]

  useEffect(() => {
    let active = true

    import('@paper-design/shaders').then(({ liquidMetalFragmentShader, ShaderMount }) => {
      if (!active || !shaderEl.current) return

      shader.current?.dispose()
      shader.current = new ShaderMount(
        shaderEl.current,
        liquidMetalFragmentShader,
        {
          u_repetition: 4,
          u_softness: 0.5,
          u_shiftRed: 0.3,
          u_shiftBlue: 0.3,
          u_distortion: 0,
          u_contour: 0,
          u_angle: 45,
          u_scale: 8,
          u_shape: 1,
          u_offsetX: 0.1,
          u_offsetY: -0.1,
        },
        undefined,
        idleSpeed,
      )
    }).catch((err) => {
      console.error('AI 液态按钮 Shader 加载失败', err)
    })

    return () => {
      active = false
      shader.current?.dispose()
      shader.current = null
    }
  }, [idleSpeed])

  return (
    <span
      className={`ai-liquid-button relative inline-flex rounded-full transition-transform duration-150 ${pressed ? 'translate-y-px scale-[0.98]' : ''}`}
      style={{ perspective: '1000px' }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: 'var(--ai-liquid-shell)',
          boxShadow: pressed
            ? 'var(--ai-liquid-shadow-pressed)'
            : hovered
              ? 'var(--ai-liquid-shadow-hover)'
              : 'var(--ai-liquid-shadow)',
        }}
      >
        <span ref={shaderEl} className="ai-liquid-shader absolute inset-0 overflow-hidden rounded-full" />
      </span>

      <span
        aria-hidden
        className="pointer-events-none absolute inset-[2px] z-10 rounded-full"
        style={{
          background: 'var(--ai-liquid-core)',
          boxShadow: pressed
            ? 'var(--ai-liquid-core-shadow-pressed)'
            : 'var(--ai-liquid-core-shadow)',
        }}
      />

      <button
        {...props}
        ref={buttonEl}
        type={type}
        disabled={disabled}
        className={`relative z-20 flex items-center justify-center gap-2 overflow-hidden rounded-full bg-transparent font-normal text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 dark:focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45 ${iconOnly ? config.icon : config.button} ${className}`}
        style={{ textShadow: 'var(--ai-liquid-text-shadow)' }}
        onMouseEnter={(e) => {
          if (!disabled) {
            hoveredRef.current = true
            setHovered(true)
            shader.current?.setSpeed(1)
          }
          onMouseEnter?.(e)
        }}
        onMouseLeave={(e) => {
          hoveredRef.current = false
          setHovered(false)
          setPressed(false)
          shader.current?.setSpeed(idleSpeed)
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
          shader.current?.setSpeed(2.4)
          window.setTimeout(() => shader.current?.setSpeed(hoveredRef.current ? 1 : idleSpeed), 300)

          const rect = buttonEl.current?.getBoundingClientRect()
          if (rect) {
            const ripple = {
              id: rippleId.current++,
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            }
            setRipples((items) => [...items, ripple])
            window.setTimeout(() => setRipples((items) => items.filter((item) => item.id !== ripple.id)), 600)
          }

          onClick?.(e)
        }}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            aria-hidden
            className="ai-liquid-ripple pointer-events-none absolute h-5 w-5 rounded-full"
            style={{
              left: ripple.x,
              top: ripple.y,
              background: 'radial-gradient(circle, var(--ai-liquid-ripple) 0%, transparent 70%)',
            }}
          />
        ))}
      </button>
    </span>
  )
}
