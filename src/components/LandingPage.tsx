import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

interface LandingPageProps {
  onEnter: () => void
}

/**
 * 懒加载视频：仅当元素进入视口时才挂载 <video> 并播放，离开视口立即卸载。
 * 避免多个视频在后台常驻解码导致页面卡死；未进入视口时只显示封面图。
 */
function LazyVideo({
  src,
  poster,
  className,
}: {
  src: string
  poster: string
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '150px', threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={containerRef} className={className}>
      <img
        src={poster || '/placeholder.svg'}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {visible && (
        <video
          src={src}
          poster={poster}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="none"
        />
      )}
    </div>
  )
}

/** 能力区三个阶段，完全复刻 Flow 的 Plan / Create / Refine 滚动切换 */
const stages = [
  {
    key: 'plan',
    word: '构思',
    tab: '构思',
    cardTitle: '认识你的创作 Agent',
    cardBody: '与贾维斯对话，把一句灵感扩写成完整的画面描述、分镜与提示词方案。',
    media: { type: 'collage' as const, images: ['/gallery/g3.jpg', '/gallery/g5.jpg', '/gallery/g1.jpg', '/gallery/g2.jpg'] },
  },
  {
    key: 'create',
    word: '创作',
    tab: '创作',
    cardTitle: '图像与视频生成',
    cardBody: '文生图、图生图一键出片，视频生成能力即将接入，静态画面将动起来。',
    media: { type: 'video' as const, src: '/videos/flow-create.mp4', poster: '/gallery/g7.jpg' },
  },
  {
    key: 'refine',
    word: '精修',
    tab: '精修',
    cardTitle: '局部重绘与放大',
    cardBody: '对满意的作品继续雕琢：局部编辑、风格迁移、高清放大，直到每个细节到位。',
    media: { type: 'collage' as const, images: ['/gallery/g6.jpg', '/gallery/g8.jpg', '/gallery/g4.jpg', '/gallery/g10.jpg'] },
  },
]

/**
 * 瀑布墙瓦片，按行排列，宽度权重模拟错落感。
 * poster 为静态封面图，video 为循环短视频；进入视口时才挂载视频播放（复刻 labs.google 的动态墙）。
 */
const galleryRows: { poster: string; video: string; grow: number }[][] = [
  [
    { poster: '/gallery/g6.jpg', video: '/wall/w1.mp4', grow: 2 },
    { poster: '/gallery/g10.jpg', video: '/wall/w2.mp4', grow: 3 },
    { poster: '/gallery/g3.jpg', video: '/wall/w3.mp4', grow: 4 },
    { poster: '/gallery/g7.jpg', video: '/wall/w4.mp4', grow: 3 },
    { poster: '/gallery/g5.jpg', video: '/wall/w5.mp4', grow: 2 },
  ],
  [
    { poster: '/gallery/g1.jpg', video: '/wall/w6.mp4', grow: 4 },
    { poster: '/gallery/g9.jpg', video: '/wall/w7.mp4', grow: 3 },
    { poster: '/gallery/g4.jpg', video: '/wall/w8.mp4', grow: 3 },
    { poster: '/gallery/g8.jpg', video: '/wall/w9.mp4', grow: 4 },
  ],
  [
    { poster: '/gallery/g2.jpg', video: '/wall/w10.mp4', grow: 2 },
    { poster: '/gallery/g5.jpg', video: '/wall/w5.mp4', grow: 3 },
    { poster: '/gallery/g7.jpg', video: '/wall/w4.mp4', grow: 4 },
    { poster: '/gallery/g10.jpg', video: '/wall/w2.mp4', grow: 3 },
    { poster: '/gallery/g6.jpg', video: '/wall/w1.mp4', grow: 2 },
  ],
]

const navLinks = ['概览', '模型能力', '创作工具', '定价']

/**
 * 精选集作品，上下按钮循环切换（复刻 Flow Sessions）。
 * video 当前为本地文件；发布时可替换为你服务器 / CDN 上的地址，img 作为加载前的封面图。
 */
const featuredWorks = [
  {
    key: 'lake',
    title: '山湖初晓',
    creator: '拾光\n研究所',
    body: '在遗忘的群山深处，晨雾漫过湖面。从一句灵感出发，经由构思、创作与精修，最终成为一段完整的视觉叙事。',
    img: '/gallery/g6.jpg',
    video: '/sessions/s1.mp4',
  },
  {
    key: 'city',
    title: '霓虹雨夜',
    creator: '千帧\n宇宙',
    body: '雨水冲刷着赛博都市的街道，霓虹在湿漉的沥青上折射成河。光影、色彩与氛围，全部由提示词驱动。',
    img: '/gallery/g5.jpg',
    video: '/sessions/s2.mp4',
  },
  {
    key: 'desert',
    title: '奔腾原野',
    creator: '贾维斯\n创作季',
    body: '金色时刻的荒漠里，白马踏起漫天尘土。动态模糊与胶片颗粒，让生成的画面拥有电影般的质感。',
    img: '/gallery/g1.jpg',
    video: '/sessions/s3.mp4',
  },
]

export default function LandingPage({ onEnter }: LandingPageProps) {
  const heroContentRef = useRef<HTMLDivElement>(null)
  const wallRef = useRef<HTMLDivElement>(null)
  const capsTrackRef = useRef<HTMLDivElement>(null)
  const stageVideoRef = useRef<HTMLVideoElement>(null)
  const [activeStage, setActiveStage] = useState(0)
  const activeStageRef = useRef(0)
  /**
   * 精选集 3D 转轮（复刻 Flow Sessions）：
   * 作品卡片围绕一个巨大的圆环排布（rotateY + translateZ），
   * ringIndex 累计增减，整个圆环持续朝同一方向旋转，把下一张卡转到焦点位。
   */
  const [ringIndex, setRingIndex] = useState(0)
  const RING_SLOTS = featuredWorks.length * 2 // 3 组作品重复两遍 = 6 个卡位，环形更饱满
  const SLOT_ANGLE = 360 / RING_SLOTS
  const RING_RADIUS = 640

  const cycleWork = (dir: 1 | -1) => setRingIndex((prev) => prev + dir)

  const activeSlot = ((ringIndex % RING_SLOTS) + RING_SLOTS) % RING_SLOTS
  const activeWork = activeSlot % featuredWorks.length
  const work = featuredWorks[activeWork]

  /** 转轮视频：仅播放焦点卡位，其余暂停省资源 */
  const ringVideoRefs = useRef<(HTMLVideoElement | null)[]>([])
  useEffect(() => {
    ringVideoRefs.current.forEach((v, slot) => {
      if (!v) return
      if (slot === activeSlot) {
        v.play().catch(() => {})
      } else {
        v.pause()
      }
    })
  }, [activeSlot])

  /** 仅在"创作"阶段激活时播放视频，其余时间暂停以省资源 */
  useEffect(() => {
    const video = stageVideoRef.current
    if (!video) return
    if (stages[activeStage]?.media.type === 'video') {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [activeStage])

  useEffect(() => {
    if (!heroContentRef.current || !wallRef.current) return

    const tl = gsap.timeline()
    tl.fromTo(
      wallRef.current,
      { opacity: 0, scale: 1.04 },
      { opacity: 1, scale: 1, duration: 1.2, ease: 'power2.out' },
    )
    tl.fromTo(
      heroContentRef.current.children,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out', stagger: 0.12 },
      '-=0.6',
    )
  }, [])

  /** 依据滚动进度切换能力区阶段（rAF 节流，避免滚动卡顿） */
  useEffect(() => {
    const track = capsTrackRef.current
    if (!track) return

    let ticking = false

    const update = () => {
      ticking = false
      const rect = track.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      if (total <= 0) return
      const progress = Math.min(Math.max(-rect.top / total, 0), 0.999)
      const idx = Math.floor(progress * stages.length)
      if (idx !== activeStageRef.current) {
        activeStageRef.current = idx
        setActiveStage(idx)
      }
    }

    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /** 点击 Tab：立即切换阶段并滚动到对应位置 */
  const scrollToStage = (idx: number) => {
    const track = capsTrackRef.current
    if (!track) return
    activeStageRef.current = idx
    setActiveStage(idx)
    const total = track.offsetHeight - window.innerHeight
    const top = track.offsetTop + (total * (idx + 0.5)) / stages.length
    window.scrollTo({ top, behavior: 'smooth' })
  }

  return (
    <main className="min-h-svh bg-black text-white">
      <h1 className="sr-only">我的贾维斯 / JWS Image</h1>

      {/* 顶部导航 */}
      <header className="fixed inset-x-0 top-0 z-30 bg-black">
        <nav className="flex h-16 items-center justify-between px-4 md:px-6" aria-label="主导航">
          <div className="flex items-center gap-3">
            <img
              src="/jws-brand.jpg"
              alt="JWS Image 标志"
              className="h-9 w-9 rounded-lg object-cover object-top"
            />
            <span className="text-lg font-medium tracking-tight">我的贾维斯</span>
          </div>

          <ul className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <li key={link}>
                <span className="cursor-default text-sm text-zinc-400 transition-colors hover:text-white">
                  {link}
                </span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onEnter}
            className="rounded-full border border-white/25 px-4 py-1.5 text-sm text-white transition-colors hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            登录
          </button>
        </nav>
      </header>

      {/* Hero：图片瀑布墙 + 叠加内容 */}
      <section className="relative flex min-h-svh flex-col overflow-hidden pt-16">
        {/* 瀑布墙背景 */}
        <div ref={wallRef} className="absolute inset-0 top-16" aria-hidden="true">
          <div className="flex h-full flex-col gap-2 p-2">
            {galleryRows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex min-h-0 flex-1 gap-2">
                {row.map((item, i) => (
  <div
  key={`${rowIndex}-${i}`}
  className="relative min-w-0 overflow-hidden rounded-xl opacity-80"
  style={{ flexGrow: item.grow, flexBasis: 0 }}
  >
  <LazyVideo src={item.video} poster={item.poster} className="absolute inset-0" />
  </div>
                ))}
              </div>
            ))}
          </div>
          {/* 暗化遮罩 */}
          <div className="absolute inset-0 bg-black/55" />
          <div className="absolute inset-0 [background:radial-gradient(70%_55%_at_50%_50%,rgba(0,0,0,.5)_0%,transparent_100%)]" />
        </div>

        {/* 叠加内容 */}
        <div
          ref={heroContentRef}
          className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-16 text-center"
        >
          <p className="text-5xl font-medium leading-none tracking-tight text-white sm:text-7xl md:text-8xl lg:text-9xl">
            <span className="text-balance">JWS Image</span>
          </p>

          <p className="max-w-xl text-pretty text-lg leading-relaxed text-white/90 md:text-2xl">
            基于先进生成模型打造的
            <br className="hidden sm:block" />
            AI 图像创作工作台
          </p>

          <button
            type="button"
            onClick={onEnter}
            className="rounded-full bg-white px-8 py-4 text-base font-medium text-black shadow-xl transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white md:text-lg"
          >
            开始使用我的贾维斯
          </button>

          <div className="flex flex-col items-center gap-1 text-xs text-zinc-400">
            <p>
              探索{' '}
              <a
                href="https://web.aijws.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-white"
              >
                My Jarvis 订阅服务
              </a>
              ，生成、编辑与 Agent 创作链路合而为一。
            </p>
            <p>功能可能因订阅等级与平台（Web 与移动端）而异。</p>
          </div>
        </div>

        {/* 向下箭头 */}
        <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center" aria-hidden="true">
          <svg
            className="h-6 w-6 animate-bounce text-white/70"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* 能力区：滚动固定切换（复刻 Flow Capabilities） */}
      <section ref={capsTrackRef} className="relative h-[450vh]" aria-label="模型能力">
        <div className="sticky top-0 flex h-svh flex-col overflow-hidden [background:radial-gradient(120%_100%_at_50%_115%,#1a4a8a_0%,#0c2a55_38%,#050d1c_70%,#000_100%)]">
          {/* 区块标题 */}
          <p className="pt-24 text-center text-lg text-zinc-400">模型能力</p>

          {/* 超大阶段词（常驻挂载，交叉淡入淡出） */}
          <div className="relative z-10 mt-2 h-[1.1em] px-6 text-5xl font-medium leading-none tracking-tight sm:text-6xl md:px-12 md:text-8xl">
            {stages.map((s, i) => (
              <h2
                key={s.key}
                aria-hidden={i !== activeStage}
                className={`absolute left-6 top-0 text-white transition-all duration-500 ease-out md:left-12 ${
                  i === activeStage ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
              >
                {s.word}
              </h2>
            ))}
          </div>

          {/* 层叠媒体卡片 */}
          <div className="pointer-events-none absolute bottom-28 left-1/2 z-0 w-[92%] max-w-5xl -translate-x-1/2 md:bottom-24 md:left-[56%] md:w-[70%]">
            {/* 背后层叠的卡片 */}
            <div className="absolute -right-10 top-8 hidden h-full w-full rounded-2xl bg-zinc-900/90 shadow-2xl md:block" aria-hidden="true" />
            <div className="absolute -right-5 top-4 hidden h-full w-full rounded-2xl bg-zinc-800/90 shadow-2xl md:block" aria-hidden="true" />

            {/* 前景媒体卡片：三个阶段全部常驻，仅切换透明度，避免视频反复重载 */}
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl">
              {stages.map((s, i) => (
                <div
                  key={s.key}
                  aria-hidden={i !== activeStage}
                  className={`absolute inset-0 transition-opacity duration-500 ease-out ${
                    i === activeStage ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {s.media.type === 'video' ? (
                    <video
                      ref={stageVideoRef}
                      src={s.media.src}
                      poster={s.media.poster}
                      className="h-full w-full object-cover"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <div className="grid h-full grid-cols-2 gap-1.5 p-1.5">
                      {s.media.images.map((src, j) => (
                        <img
                          key={src + j}
                          src={src || "/placeholder.svg"}
                          alt=""
                          className="h-full w-full rounded-lg object-cover"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 左下说明卡片（常驻挂载，交叉淡入淡出） */}
          <div className="absolute bottom-28 left-4 z-10 md:bottom-24 md:left-8">
            <div className="relative h-36 w-72 max-w-[80vw]">
              {stages.map((s, i) => (
                <div
                  key={s.key}
                  aria-hidden={i !== activeStage}
                  className={`absolute inset-x-0 bottom-0 rounded-2xl border border-white/10 bg-[#0e2c52]/90 p-5 shadow-xl backdrop-blur-sm transition-all duration-500 ease-out ${
                    i === activeStage ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
                  }`}
                >
                  <h3 className="text-base font-medium text-white">{s.cardTitle}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">{s.cardBody}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 底部固定胶囊 Tab 栏 */}
          <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-4">
            <div className="flex items-center gap-1 rounded-full border border-white/15 bg-black/50 p-1.5 shadow-2xl backdrop-blur-md">
              {stages.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => scrollToStage(i)}
                  aria-pressed={i === activeStage}
                  className={`rounded-full px-4 py-2 text-sm transition-all duration-200 active:scale-95 md:px-6 md:text-base ${
                    i === activeStage
                      ? 'bg-white/25 text-white'
                      : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {s.tab}
                </button>
              ))}
              <button
                type="button"
                onClick={onEnter}
                className="ml-1 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition-transform hover:scale-[1.02] md:px-6 md:text-base"
              >
                使用我的贾维斯创作
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 创作者精选区（复刻 Flow Sessions：文字层在上，下层是 3D 媒体转轮）。布局依赖三列宽屏结构，窄屏隐藏 */}
      <section
        className="relative hidden h-svh overflow-hidden [background:radial-gradient(120%_120%_at_30%_80%,#4a3208_0%,#2b1d06_40%,#120b02_75%,#000_100%)] lg:block"
        aria-label="创作者精选"
      >
        {/* ===== 底层：3D 转轮（卡片围绕圆环，切换时整环旋转） ===== */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ perspective: '1600px' }}
          aria-hidden="true"
        >
          {/* 整体倾斜，呈现 Flow 的对角线环带效果 */}
          <div style={{ transform: 'rotate(-10deg)', transformStyle: 'preserve-3d' }}>
            <div
              style={{
                transformStyle: 'preserve-3d',
                transform: `translateZ(-${RING_RADIUS}px) rotateY(${-ringIndex * SLOT_ANGLE}deg)`,
                transition: 'transform 1000ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {Array.from({ length: RING_SLOTS }, (_, slot) => {
                const w = featuredWorks[slot % featuredWorks.length]
                const focused = slot === activeSlot
                return (
                  <div
                    key={slot}
                    className="absolute left-1/2 top-1/2 aspect-[16/10] w-[20rem] md:w-[30rem] lg:w-[34rem]"
                    style={{
                      transform: `translate(-50%, -50%) rotateY(${slot * SLOT_ANGLE}deg) translateZ(${RING_RADIUS}px)`,
                      transformStyle: 'preserve-3d',
                      backfaceVisibility: 'hidden',
                    }}
                  >
                    <div
                      className={`h-full w-full overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/15 transition-all duration-1000 ${
                        focused ? 'opacity-100 blur-0' : 'opacity-40 blur-[4px]'
                      }`}
                    >
                      <video
                        ref={(el) => {
                          ringVideoRefs.current[slot] = el
                        }}
                        src={w.video}
                        poster={w.img}
                        className="h-full w-full object-cover"
                        muted
                        loop
                        playsInline
                        preload="metadata"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ===== 顶层：文字层（中间透明露出转轮） ===== */}
        {/* 半出血大标题 */}
        <p
          className="pointer-events-none absolute -top-10 left-4 z-10 select-none text-[7rem] font-medium leading-none tracking-tight text-white/90 blur-[6px] sm:text-[10rem] md:-top-16 md:text-[14rem]"
          aria-hidden="true"
        >
          精选集
        </p>

        <div className="pointer-events-none relative z-10 grid h-full items-center gap-8 px-4 md:grid-cols-[1fr_minmax(280px,34rem)_1fr] md:px-8">
          {/* 左列：作品名单垂直轮盘（聚焦项清晰，其余虚化） */}
          <div className="flex flex-col justify-center gap-8 md:gap-10">
            {featuredWorks.map((w, i) => (
              <p
                key={w.key}
                className={`font-medium leading-tight transition-all duration-700 ${
                  i === activeWork
                    ? 'text-5xl text-white blur-0 sm:text-6xl md:text-7xl'
                    : 'text-3xl text-white/40 blur-[3px] sm:text-4xl'
                }`}
              >
                {w.creator.split('\n').map((line, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {line}
                  </span>
                ))}
              </p>
            ))}
          </div>

          {/* 中列：透明，露出下层转轮的焦点卡片 */}
          <div aria-hidden="true" />

          {/* 右列：精选作品详情（跟随切换淡入） */}
          <div className="flex flex-col justify-center gap-6 md:pl-8">
            <div className="relative min-h-[7rem] md:min-h-[10rem]">
              {featuredWorks.map((w, i) => (
                <h2
                  key={w.key}
                  aria-hidden={i !== activeWork}
                  className={`absolute inset-x-0 top-0 text-4xl font-medium leading-tight tracking-tight text-white transition-all duration-700 ease-out sm:text-5xl md:text-6xl ${
                    i === activeWork ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                  }`}
                >
                  <span className="text-balance">{w.title}</span>
                </h2>
              ))}
            </div>
            <p key={work.key} className="max-w-xs animate-[fadeInUp_.5s_ease_both] text-pretty leading-relaxed text-zinc-300">
              {work.body}
            </p>
            <button
              type="button"
              onClick={onEnter}
              className="pointer-events-auto w-fit text-lg font-medium text-white underline underline-offset-4 transition-colors hover:text-zinc-300"
            >
              去创作
            </button>
            <p className="font-mono text-xs tracking-widest text-zinc-500">
              {String(activeWork + 1).padStart(2, '0')} / {String(featuredWorks.length).padStart(2, '0')}
            </p>
          </div>
        </div>

        {/* 右侧上下翻页按钮（切换精选作品） */}
        <div className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-3 md:right-6">
          <button
            type="button"
            onClick={() => cycleWork(-1)}
            aria-label="上一个作品"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => cycleWork(1)}
            aria-label="下一个作品"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-105 active:scale-95"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </section>

      {/* 视频生成预告区 */}
      <section className="relative overflow-hidden bg-black py-24 md:py-32" aria-label="视频生成">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-4 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">即将上线</p>
          <h2 className="text-4xl font-medium tracking-tight text-white md:text-6xl">
            <span className="text-balance">视频生成，让画面动起来</span>
          </h2>
          <p className="max-w-2xl text-pretty text-lg leading-relaxed text-zinc-400">
            视频生成能力即将接入我的贾维斯。从一张图、一段描述出发，生成流畅��动态影像，与图像创作共用同一套工作流。
          </p>

          <div className="relative mt-4 w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
            <LazyVideo
              src="/videos/flow-showcase.mp4"
              poster="/gallery/g7.jpg"
              className="relative aspect-video w-full"
            />
            <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/70 via-transparent to-transparent p-6">
              <span className="text-left text-sm text-zinc-300">视频生成预览 · 敬请期待</span>
              <span className="rounded-full border border-white/25 px-3 py-1 text-xs uppercase tracking-widest text-white">
                Coming Soon
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onEnter}
            className="mt-4 rounded-full bg-white px-8 py-4 text-base font-medium text-black shadow-xl transition-transform hover:scale-[1.03] md:text-lg"
          >
            先从图像创作开始
          </button>
        </div>
      </section>

      {/* 收尾 CTA 区：液态金属视频背景 + 玻璃卡片（懒加载，进入视口才播放） */}
      <section className="relative h-svh overflow-hidden" aria-label="开始创作">
        <LazyVideo
          src="/videos/liquid-metal.mp4"
          poster="/videos/liquid-metal-poster.png"
          className="absolute inset-0"
        />
        {/* 轻微压暗，保证卡片可读性 */}
        <div className="absolute inset-0 bg-black/20" aria-hidden="true" />

        <div className="relative z-10 flex h-full items-end p-4 pb-16 md:items-center md:p-16">
          <div className="max-w-xl rounded-2xl border border-white/15 bg-black/35 p-8 shadow-2xl backdrop-blur-md md:p-12">
            <h2 className="text-4xl font-medium leading-tight tracking-tight text-white md:text-5xl lg:text-6xl">
              <span className="text-balance">把你的想象变成现实</span>
            </h2>
            <p className="mt-5 max-w-md text-pretty leading-relaxed text-zinc-300">
              与贾维斯一起，把一句灵感变成一幅作品。从构思、创作到精修，AI 全程陪伴，让每个人都能创作出打动人心的画面。
            </p>
            <button
              type="button"
              onClick={onEnter}
              className="mt-8 rounded-full border border-white/30 bg-white/10 px-7 py-3 text-sm font-medium uppercase tracking-widest text-white backdrop-blur-sm transition-all hover:bg-white hover:text-black active:scale-95"
            >
              开始创作
            </button>
          </div>
        </div>
      </section>

      {/* 页脚 */}
      <footer className="border-t border-white/10 bg-black py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 md:flex-row">
          <div className="flex items-center gap-3">
            <img src="/jws-brand.jpg" alt="JWS Image 标志" className="h-8 w-8 rounded-lg object-cover object-top" />
            <span className="text-sm text-zinc-400">我的贾维斯 · JWS Image</span>
          </div>
          <p className="text-xs text-zinc-500">
            探索{' '}
            <a
              href="https://web.aijws.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              My Jarvis 订阅服务
            </a>
          </p>
        </div>
      </footer>
    </main>
  )
}
