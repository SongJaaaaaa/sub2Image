import { useEffect, useMemo, useRef, useState } from 'react'
import Select from '../../../components/ui/Select'
import { DownloadIcon, PauseIcon, PlayIcon, RefreshIcon, StopIcon } from '../../../components/ui/icons'
import { createMediaSpeech, listMediaVoices, type VoiceOption } from '../../adapters/mediaApi'
import './voiceGenerator.css'

const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'
type DisplayNames = { of: (code: string) => string | undefined }
const DisplayNames = (Intl as unknown as {
  DisplayNames: new (locales: string[], options: { type: 'language' | 'region' }) => DisplayNames
}).DisplayNames
const LANGUAGE_NAMES = new DisplayNames(['zh-CN'], { type: 'language' })
const REGION_NAMES = new DisplayNames(['zh-CN'], { type: 'region' })

export default function VoiceGeneratorTool() {
  const [text, setText] = useState('')
  const [voices, setVoices] = useState<VoiceOption[]>([])
  const [voice, setVoice] = useState(DEFAULT_VOICE)
  const [search, setSearch] = useState('')
  const [locale, setLocale] = useState('')
  const [gender, setGender] = useState('')
  const [rate, setRate] = useState(0)
  const [pitch, setPitch] = useState(0)
  const [volume, setVolume] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadKey, setLoadKey] = useState(0)
  const [voiceError, setVoiceError] = useState('')
  const [busy, setBusy] = useState<'preview' | 'full' | null>(null)
  const [previewVoice, setPreviewVoice] = useState('')
  const [playingVoice, setPlayingVoice] = useState('')
  const [audioVoice, setAudioVoice] = useState('')
  const [error, setError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [audioName, setAudioName] = useState('speech.mp3')
  const audioRef = useRef('')
  const playerRef = useRef<HTMLAudioElement>(null)
  const ctrlRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setVoiceError('')
    listMediaVoices(ctrl.signal)
      .then((items) => {
        setVoices(items)
        setVoice(items.some((item) => item.name === DEFAULT_VOICE) ? DEFAULT_VOICE : items[0]?.name ?? '')
      })
      .catch((err) => {
        if ((err as { name?: string }).name !== 'AbortError') setVoiceError(err instanceof Error ? err.message : '音色列表加载失败')
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [loadKey])

  useEffect(() => () => {
    ctrlRef.current?.abort()
    if (audioRef.current) URL.revokeObjectURL(audioRef.current)
  }, [])

  const locales = useMemo(() => Array.from(new Set(voices.map((item) => item.locale))).sort((a, b) => {
    if (a === 'zh-CN') return -1
    if (b === 'zh-CN') return 1
    return a.localeCompare(b)
  }), [voices])
  const localeLabels = useMemo(() => new Map(locales.map((value) => {
    const item = new Intl.Locale(value)
    const language = LANGUAGE_NAMES.of(item.language) ?? item.language
    const region = item.region ? REGION_NAMES.of(item.region) : ''
    return [value, `${language}${region ? `（${region}）` : ''} · ${value}`]
  })), [locales])
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return voices.filter((item) => {
      if (locale && item.locale !== locale) return false
      if (gender && item.gender !== gender) return false
      if (!keyword) return true
      return `${item.displayName} ${item.name} ${item.locale} ${localeLabels.get(item.locale) ?? ''}`.toLowerCase().includes(keyword)
    })
  }, [gender, locale, localeLabels, search, voices])
  const selected = voices.find((item) => item.name === voice)

  const generate = async (preview: boolean, item = selected, sample = '') => {
    if (!item) return
    const value = sample || (preview ? text.trim().slice(0, 80) : text.trim())
    if (!value) return
    ctrlRef.current?.abort()
    playerRef.current?.pause()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setBusy(preview ? 'preview' : 'full')
    setPreviewVoice(preview ? item.name : '')
    setPlayingVoice('')
    setError('')
    try {
      const blob = await createMediaSpeech({ text: value, voice: item.name, rate, pitch, volume }, ctrl.signal)
      const url = URL.createObjectURL(blob)
      if (audioRef.current) URL.revokeObjectURL(audioRef.current)
      audioRef.current = url
      setAudioUrl(url)
      setAudioVoice(item.name)
      setAudioName(preview ? 'voice-preview.mp3' : 'speech.mp3')
      if (preview && playerRef.current) {
        playerRef.current.src = url
        await playerRef.current.play()
        setPlayingVoice(item.name)
      }
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        console.warn('音色试听失败', err)
        setError(err instanceof Error ? err.message : '语音生成失败')
      }
    } finally {
      if (ctrlRef.current === ctrl) {
        ctrlRef.current = null
        setBusy(null)
        setPreviewVoice('')
      }
    }
  }

  const cancel = () => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
    setBusy(null)
    setPreviewVoice('')
  }

  const audition = (item: VoiceOption) => {
    setVoice(item.name)
    if (busy === 'preview' && previewVoice === item.name) {
      cancel()
      return
    }
    if (busy) return
    if (playingVoice === item.name) {
      playerRef.current?.pause()
      if (playerRef.current) playerRef.current.currentTime = 0
      setPlayingVoice('')
      return
    }
    const lang = new Intl.Locale(item.locale).language
    const sample = new DisplayNames([item.locale], { type: 'language' }).of(lang) ?? item.displayName
    void generate(true, item, sample)
  }

  return (
    <div className="voice-tool">
      <section className="voice-editor" aria-label="语音生成">
        <div className="voice-section-title">
          <div>
            <h2>文字转语音</h2>
            <p>{selected ? `${selected.displayName} · ${localeLabels.get(selected.locale) ?? selected.locale}` : '选择一个音色开始生成'}</p>
          </div>
          <span className="voice-count">{text.length}/5000</span>
        </div>

        <textarea
          aria-label="要朗读的文字"
          value={text}
          maxLength={5000}
          onChange={(event) => setText(event.target.value)}
          placeholder="输入需要转换成语音的文字"
        />

        <div className="voice-controls">
          <label>
            <span>语速 <output>{rate > 0 ? `+${rate}` : rate}%</output></span>
            <input aria-label="语速" type="range" min="-50" max="100" value={rate} onChange={(event) => setRate(Number(event.target.value))} />
          </label>
          <label>
            <span>音调 <output>{pitch > 0 ? `+${pitch}` : pitch}Hz</output></span>
            <input aria-label="音调" type="range" min="-50" max="50" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} />
          </label>
          <label>
            <span>音量 <output>{volume > 0 ? `+${volume}` : volume}%</output></span>
            <input aria-label="音量" type="range" min="-50" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
          </label>
        </div>

        {error && <p className="voice-error" role="alert">{error}</p>}

        <div className="voice-actions">
          <button type="button" className="voice-secondary" disabled={!text.trim() || !voice || Boolean(busy)} onClick={() => void generate(true)}>
            {busy === 'preview' ? '正在试听...' : '试听前 80 字'}
          </button>
          <button type="button" className="voice-primary" disabled={!text.trim() || !voice || Boolean(busy)} onClick={() => void generate(false)}>
            {busy === 'full' ? '正在生成...' : '生成 MP3'}
          </button>
          {busy && (
            <button type="button" className="voice-icon-button" onClick={cancel} title="取消生成" aria-label="取消生成">
              <StopIcon />
            </button>
          )}
        </div>

        <div className="voice-output" data-empty={!audioUrl}>
          <audio
            ref={playerRef}
            controls
            src={audioUrl || undefined}
            onPlay={() => setPlayingVoice(audioVoice)}
            onPause={() => setPlayingVoice('')}
            onEnded={() => setPlayingVoice('')}
          />
          {audioUrl ? (
            <a href={audioUrl} download={audioName} className="voice-download">
              <DownloadIcon />
              下载 MP3
            </a>
          ) : <span>生成结果会显示在这里</span>}
        </div>
      </section>

      <aside className="voice-library" aria-label="音色库">
        <div className="voice-section-title">
          <div>
            <h2>音色库</h2>
            <p>{loading ? '正在获取音色...' : voiceError ? '音色获取失败' : `${filtered.length} 个可用音色`}</p>
          </div>
        </div>
        <input aria-label="搜索音色" className="voice-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、语言或地区" />
        <div className="voice-filters">
          <label>
            <span>语言 / 地区</span>
            <Select
              ariaLabel="语言或地区"
              value={locale}
              onChange={(value) => setLocale(String(value))}
              options={[
                { value: '', label: '全部国家 / 地区' },
                ...locales.map((value) => ({ value, label: localeLabels.get(value) ?? value })),
              ]}
              className="voice-select"
            />
          </label>
          <label>
            <span>性别</span>
            <Select
              ariaLabel="性别"
              value={gender}
              onChange={(value) => setGender(String(value))}
              options={[
                { value: '', label: '全部' },
                { value: 'Female', label: '女声' },
                { value: 'Male', label: '男声' },
              ]}
              className="voice-select"
            />
          </label>
        </div>
        <div className="voice-list">
          {filtered.map((item) => (
            <div
              key={item.name}
              className={item.name === voice ? 'voice-item voice-item-active' : 'voice-item'}
            >
              <button type="button" className="voice-item-main" aria-label={`选择 ${item.displayName}`} onClick={() => setVoice(item.name)}>
                <span className="voice-avatar">{item.gender === 'Female' ? '女' : '男'}</span>
                <span className="voice-item-text">
                  <strong>{item.displayName}</strong>
                  <small>{localeLabels.get(item.locale) ?? item.locale} · {item.name}</small>
                </span>
              </button>
              <button
                type="button"
                className={busy === 'preview' && previewVoice === item.name ? 'voice-play voice-play-loading' : 'voice-play'}
                title={playingVoice === item.name ? '停止试听' : '试听音色'}
                aria-label={`${item.displayName}，${playingVoice === item.name ? '停止试听' : '点击试听'}`}
                disabled={Boolean(busy) && previewVoice !== item.name}
                onClick={() => audition(item)}
              >
                {playingVoice === item.name ? <PauseIcon /> : <PlayIcon />}
              </button>
            </div>
          ))}
          {!loading && voiceError && !voices.length && (
            <div className="voice-empty-state" role="alert">
              <p>{voiceError}</p>
              <button type="button" className="voice-retry" onClick={() => setLoadKey((value) => value + 1)}>
                <RefreshIcon />
                重新获取
              </button>
            </div>
          )}
          {!loading && !voiceError && !filtered.length && <p className="voice-empty">没有符合条件的音色</p>}
        </div>
      </aside>
    </div>
  )
}
