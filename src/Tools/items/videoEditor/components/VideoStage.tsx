import type { ImageOverlay, SubtitleCue, SubtitleStyle, VideoClip, VideoSource } from '../types'
import type { VideoPlayback } from '../hooks/useVideoPlayback'
import { getActiveSubtitle } from '../lib/subtitleTrack'
import OverlayCanvas from './OverlayCanvas'

type Props = {
  clips: VideoClip[]
  sources: VideoSource[]
  overlays: ImageOverlay[]
  subtitles: SubtitleCue[]
  subtitleStyle: SubtitleStyle
  ratio: string
  selectedOverlayId: string
  selectedSubtitleId: string
  playback: VideoPlayback
  onSelectOverlay: (id: string) => void
  onSelectSubtitle: (id: string) => void
  onChangeOverlay: (overlay: ImageOverlay) => void
}

export default function VideoStage({ clips, sources, overlays, subtitles, subtitleStyle, ratio, selectedOverlayId, selectedSubtitleId, playback, onSelectOverlay, onSelectSubtitle, onChangeOverlay }: Props) {
  const activeIdx = clips.findIndex((clip) => clip.id === playback.active?.clip.id)
  const subtitle = getActiveSubtitle(subtitles, playback.time)
  return (
    <div className="video-editor-stage" style={{ aspectRatio: ratio.replace(':', ' / ') }}>
      {clips.map((clip, idx) => {
        const source = sources.find((item) => item.id === clip.sourceId)
        if (!source) return null
        return (
          <video
            key={clip.id}
            ref={(el) => {
              if (el) playback.videosRef.current.set(clip.id, el)
              else playback.videosRef.current.delete(clip.id)
            }}
            src={source.url}
            className={clip.id === playback.visibleClipId ? 'active' : ''}
            preload={idx === activeIdx || idx === activeIdx + 1 ? 'auto' : 'metadata'}
            playsInline
            onLoadedMetadata={(event) => {
              const target = playback.active?.clip.id === clip.id
                ? clip.sourceStart + playback.time - playback.active.start
                : clip.sourceStart
              if (Math.abs(event.currentTarget.currentTime - target) > 0.05) event.currentTarget.currentTime = target
            }}
            onTimeUpdate={(event) => playback.onVideoTimeUpdate(clip.id, event.currentTarget)}
          />
        )
      })}
      <OverlayCanvas overlays={overlays} time={playback.time} selectedId={selectedOverlayId} onSelect={onSelectOverlay} onChange={onChangeOverlay} />
      {subtitle && (
        <button
          type="button"
          className={`video-editor-stage-subtitle video-editor-stage-subtitle-${subtitleStyle.position} ${subtitle.id === selectedSubtitleId ? 'selected' : ''}`}
          style={{
            color: subtitleStyle.color,
            background: `rgb(0 0 0 / ${subtitleStyle.backgroundOpacity})`,
            fontSize: `clamp(14px, ${subtitleStyle.fontSize / 7.2}cqh, 52px)`,
          }}
          onClick={() => onSelectSubtitle(subtitle.id)}
        >
          {subtitle.text}
        </button>
      )}
      {!playback.activeSource && <span>时间轴暂无片段</span>}
    </div>
  )
}
