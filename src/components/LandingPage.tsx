import { useEffect, useRef, useState } from 'react'

interface LandingPageProps {
  onEnter: () => void
}

export default function LandingPage({ onEnter }: LandingPageProps) {
  const pageRef = useRef<HTMLElement>(null)
  const roadRef = useRef<HTMLElement>(null)
  const [enterActive, setEnterActive] = useState(false)

  useEffect(() => {
    const page = pageRef.current
    const road = roadRef.current
    if (!page || !road) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    let raf = 0

    const draw = () => {
      pointer.x += (pointer.tx - pointer.x) * 0.08
      pointer.y += (pointer.ty - pointer.y) * 0.08
      const rect = road.getBoundingClientRect()
      const max = Math.max(1, road.offsetHeight - window.innerHeight)
      const progress = Math.min(1, Math.max(0, -rect.top / max))
      const distance = progress * window.innerHeight * (window.innerWidth < 640 ? 1.05 : 1.45)
      const strength = window.innerWidth < 640 ? 6 : 14

      page.style.setProperty('--pointer-x', `${(pointer.x * strength).toFixed(2)}px`)
      page.style.setProperty('--pointer-y', `${(pointer.y * strength * 0.72).toFixed(2)}px`)
      page.style.setProperty('--pointer-rotate', `${pointer.x.toFixed(2)}deg`)
      page.style.setProperty('--road-shift', `${distance.toFixed(1)}px`)
      page.style.setProperty('--road-turn', `${((progress - 0.5) * 5).toFixed(2)}deg`)
      raf = reducedMotion ? 0 : window.requestAnimationFrame(draw)
    }

    const onPointerMove = (event: PointerEvent) => {
      pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2
      if (reducedMotion) draw()
    }

    draw()
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    if (reducedMotion) {
      window.addEventListener('scroll', draw, { passive: true })
      window.addEventListener('resize', draw)
    }

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointerMove)
      if (reducedMotion) {
        window.removeEventListener('scroll', draw)
        window.removeEventListener('resize', draw)
      }
    }
  }, [])

  return (
    <main ref={pageRef} className="landing-white bg-white text-black">
      <section className={`landing-hero relative flex min-h-[92svh] flex-col overflow-hidden border-b border-black transition-colors duration-500 ${enterActive ? 'landing-hero-enter' : ''}`}>
        <h1 className="sr-only">My Jarvis / JWS Image</h1>
        <nav className="safe-area-x safe-area-top relative z-20 flex min-h-20 items-center justify-between border-b border-current text-[11px] font-bold uppercase sm:text-xs">
          <a href="/" className="flex items-center gap-3" aria-label="JWS Image 首页">
            <span className="grid h-9 w-9 place-items-center border border-current text-sm font-black">J</span>
            <span>JWS / Image</span>
          </a>
          <div className="flex items-center gap-5 sm:gap-9">
            <a href="https://web.aijws.com/" target="_blank" rel="noopener noreferrer" className="hidden border-b border-current pb-1 opacity-55 transition-opacity hover:opacity-100 sm:inline">
              我的贾维斯 ↗
            </a>
            <span>2026 / AI Studio</span>
          </div>
        </nav>

        <div className="safe-area-x relative z-10 mx-auto grid w-full max-w-7xl flex-1 items-center gap-8 py-10 min-[900px]:grid-cols-[0.7fr_1.6fr_0.7fr]">
          <div className="hidden self-stretch border-r border-current py-10 min-[900px]:flex min-[900px]:flex-col min-[900px]:justify-between">
            <p className="text-xs font-bold uppercase leading-6">Image generation<br />and agent workspace</p>
            <p className="text-xs uppercase opacity-50">Shanghai / Online<br />My Jarvis Relay</p>
          </div>

          <div className="landing-brand-stage relative mx-auto flex w-full max-w-[650px] items-center justify-center">
            <span className="absolute left-0 top-1/2 hidden -translate-y-1/2 -rotate-90 text-[10px] font-bold uppercase opacity-40 sm:block">Move to explore</span>
            <img
              src="/jws-brand.jpg"
              alt="My Jarvis"
              className="landing-brand-image h-auto w-full select-none object-contain"
            />
            <div className="pointer-events-none absolute inset-x-[10%] top-[13%] aspect-square rounded-full border border-current opacity-15" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-x-[16%] top-[19%] aspect-square rounded-full border border-current opacity-20" aria-hidden="true" />
          </div>

          <div className="flex flex-col items-center justify-center border-current min-[900px]:h-full min-[900px]:border-l">
            <p className="mb-6 max-w-44 text-center text-sm leading-6 opacity-60">登录我的贾维斯<br />接入图像工作台</p>
            <button
              type="button"
              onClick={onEnter}
              onMouseEnter={() => setEnterActive(true)}
              onMouseLeave={() => setEnterActive(false)}
              onFocus={() => setEnterActive(true)}
              onBlur={() => setEnterActive(false)}
              className="landing-enter group relative grid h-32 w-32 place-items-center rounded-full border border-current text-xs font-bold uppercase sm:h-40 sm:w-40"
            >
              <span className="absolute inset-2 rounded-full border border-current transition-transform duration-500 group-hover:scale-75" aria-hidden="true" />
              <span className="relative">开始创作</span>
              <span className="absolute bottom-7 text-base transition-transform duration-300 group-hover:translate-x-2" aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <div className="safe-area-x relative z-10 grid grid-cols-2 gap-3 border-t border-current py-4 text-[10px] font-bold uppercase sm:grid-cols-4">
          <span>01 / JWS</span>
          <span>02 / Relay</span>
          <span className="text-right sm:text-left">03 / Image</span>
          <span className="text-right">Scroll to explore ↓</span>
        </div>
      </section>

      <section ref={roadRef} className="relative h-[190svh] bg-white">
        <div className="sticky top-0 h-svh overflow-hidden border-b border-black bg-white">
          <div className="safe-area-x absolute inset-x-0 top-0 z-30 flex items-start justify-between border-b border-black py-5 text-[10px] font-bold uppercase sm:text-xs">
            <div>
              <p>Signal route</p>
              <p className="mt-1 opacity-40">JWS → Model → Image</p>
            </div>
            <p className="text-right">我的贾维斯<br />中转服务</p>
          </div>

          <div className="landing-road-lines absolute inset-0" aria-hidden="true">
            <span className="landing-road-line landing-road-line-1" />
            <span className="landing-road-line landing-road-line-2" />
            <span className="landing-road-line landing-road-line-3" />
            <span className="landing-road-line landing-road-line-4" />
            <span className="landing-road-cross landing-road-cross-1" />
            <span className="landing-road-cross landing-road-cross-2" />
            <span className="landing-road-cross landing-road-cross-3" />
          </div>

          <div className="landing-road-mark absolute left-1/2 top-1/2 z-10 h-[42vmin] w-[42vmin] min-h-52 min-w-52 max-h-[480px] max-w-[480px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border border-black bg-white">
            <img src="/jws-brand.jpg" alt="我的贾维斯标志" className="h-full w-full scale-[1.55] object-cover object-top" />
          </div>

          <div className="landing-road-node landing-road-node-1">
            <span>Generate</span>
            <small>Text to image</small>
          </div>
          <div className="landing-road-node landing-road-node-2">
            <span>Edit</span>
            <small>Image to image</small>
          </div>
          <div className="landing-road-node landing-road-node-3">
            <span>Agent</span>
            <small>Creative workflow</small>
          </div>

          <div className="safe-area-x absolute inset-x-0 bottom-0 z-30 flex items-end justify-between border-t border-black bg-white/90 py-5 backdrop-blur-sm">
            <p className="max-w-sm text-sm leading-6 sm:text-base">一个账号连接生成、编辑与 Agent，让创作链路保持在同一个工作台。</p>
            <button type="button" onClick={onEnter} className="hidden h-24 w-24 shrink-0 rounded-full border border-black text-xs font-bold uppercase transition-colors hover:bg-black hover:text-white sm:grid sm:place-items-center">
              Connect →
            </button>
          </div>
        </div>
      </section>

      <section className="border-b border-black bg-white">
        <div className="safe-area-x mx-auto grid max-w-7xl gap-10 py-20 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div className="overflow-hidden">
            <img src="/jws-brand.jpg" alt="My Jarvis 品牌" className="h-auto w-full max-w-xl mix-blend-multiply" />
          </div>
          <div className="border-t border-black pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
            <p className="text-xs font-bold uppercase opacity-45">JWS Relay / 我的贾维斯</p>
            <h2 className="mt-5 max-w-2xl text-4xl font-black leading-none tracking-normal sm:text-5xl lg:text-6xl">连接账号，直接开始创作。</h2>
            <p className="mt-7 max-w-xl text-base leading-8 opacity-60">登录 Sub2API 后，JWS Image 自动读取项目配置与账号中的可用令牌，无需再填写任何技术配置。</p>
            <button type="button" onClick={onEnter} className="mt-9 inline-flex min-h-12 items-center gap-12 border border-black px-6 text-sm font-bold transition-colors hover:bg-black hover:text-white">
              接入 JWS <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      <footer className="safe-area-x flex flex-col gap-3 bg-white py-7 text-[11px] font-bold uppercase sm:flex-row sm:items-center sm:justify-between">
        <span>JWS Image / 2026</span>
        <a href="https://web.aijws.com/" target="_blank" rel="noopener noreferrer" className="border-b border-black pb-1">web.aijws.com ↗</a>
      </footer>
    </main>
  )
}
