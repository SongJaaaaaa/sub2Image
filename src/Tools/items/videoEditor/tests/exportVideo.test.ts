import { describe, expect, it } from 'vitest'
import type { ExportProject, VideoSource } from '../types'
import { createExportCommand, getExportSize } from '../lib/exportVideo'

const file = new File(['video'], 'source.mp4', { type: 'video/mp4' })
const source: VideoSource = {
  id: 'source-1',
  file,
  url: 'blob:video',
  name: 'source.mp4',
  duration: 10,
  width: 1920,
  height: 1080,
  codec: 'H.264',
  hasAudio: true,
  frames: ['frame-1', 'frame-2'],
}

const project: ExportProject = {
  sources: [source],
  clips: [
    { id: 'clip-1', sourceId: source.id, name: source.name, sourceStart: 1, sourceEnd: 4 },
    { id: 'clip-2', sourceId: source.id, name: source.name, sourceStart: 6, sourceEnd: 8 },
  ],
  overlays: [],
  subtitles: [],
  subtitleStyle: { fontSize: 42, color: '#ffffff', backgroundOpacity: 0.55, position: 'bottom' },
  background: null,
  originalVolume: 0.8,
  muted: false,
  ratio: '16:9',
  quality: '720p',
}

describe('video export command', () => {
  it('maps output dimensions from ratio and quality', () => {
    expect(getExportSize('16:9', '720p')).toEqual({ width: 1280, height: 720 })
    expect(getExportSize('9:16', '1080p')).toEqual({ width: 1080, height: 1920 })
    expect(getExportSize('1:1', '1080p')).toEqual({ width: 1080, height: 1080 })
  })

  it('builds trim, concat and audio filters for every clip', () => {
    const command = createExportCommand(project)
    const filter = command.args[command.args.indexOf('-filter_complex') + 1]

    expect(command.files).toHaveLength(1)
    expect(filter).toContain('trim=start=1:end=4')
    expect(filter).toContain('trim=start=6:end=8')
    expect(filter).toContain('concat=n=2:v=1:a=1[vbase][abase]')
    expect(command.args).toContain('libx264')
    expect(command.args.slice(-2)).toEqual(['5', 'output.mp4'])
  })

  it('exports video without an audio map when all audio is disabled', () => {
    const command = createExportCommand({ ...project, muted: true })
    const filter = command.args[command.args.indexOf('-filter_complex') + 1]

    expect(filter).toContain('concat=n=2:v=1:a=0[vbase]')
    expect(command.args).not.toContain('-c:a')
  })

  it('adds timed image overlays above the video track', () => {
    const image = new File(['image'], 'cover.png', { type: 'image/png' })
    const command = createExportCommand({
      ...project,
      overlays: [{
        id: 'overlay-1',
        file: image,
        url: 'blob:image',
        name: image.name,
        sourceWidth: 800,
        sourceHeight: 600,
        start: 1,
        end: 3,
        x: 0.25,
        y: 0.2,
        width: 0.4,
        rotation: 0,
        opacity: 0.8,
      }],
    })
    const filter = command.args[command.args.indexOf('-filter_complex') + 1]

    expect(command.files[1]).toMatchObject({ name: 'overlay-0.png', loop: true })
    expect(filter).toContain('scale=512:-1')
    expect(filter).toContain('rotate=0*PI/180')
    expect(filter).toContain('colorchannelmixer=aa=0.8')
    expect(filter).toContain("overlay=x=320:y=144:enable='between(t,1,3)'")
    expect(command.args).toContain('[vOverlay0]')
  })

  it('rotates an image overlay while keeping its center position', () => {
    const image = new File(['image'], 'cover.png', { type: 'image/png' })
    const command = createExportCommand({
      ...project,
      overlays: [{
        id: 'overlay-1', file: image, url: 'blob:image', name: image.name,
        sourceWidth: 800, sourceHeight: 400, start: 0, end: 2,
        x: 0.25, y: 0.2, width: 0.4, rotation: 90, opacity: 1,
      }],
    })
    const filter = command.args[command.args.indexOf('-filter_complex') + 1]

    expect(filter).toContain('rotate=90*PI/180:ow=rotw(iw):oh=roth(ih):c=none')
    expect(filter).toContain("overlay=x=448:y=16:enable='between(t,0,2)'")
  })

  it('burns rendered subtitle images into their timeline ranges', () => {
    const subtitle = new File(['image'], 'subtitle-0.png', { type: 'image/png' })
    const command = createExportCommand({
      ...project,
      subtitles: [{ id: 'subtitle-1', start: 0.5, end: 2.4, text: '测试字幕' }],
    }, [{ name: 'subtitle-0.png', file: subtitle, start: 0.5, end: 2.4, x: 80, y: 600 }])
    const filter = command.args[command.args.indexOf('-filter_complex') + 1]

    expect(command.files[1]).toMatchObject({ name: 'subtitle-0.png', loop: true })
    expect(filter).toContain('[1:v]format=rgba[subtitle0]')
    expect(filter).toContain("overlay=x=80:y=600:enable='between(t,0.5,2.4)'"
    )
    expect(command.args).toContain('[vSubtitle0]')
  })

  it('loops and delays background music to match its timeline range', () => {
    const audio = new File(['audio'], 'music.mp3', { type: 'audio/mpeg' })
    const command = createExportCommand({
      ...project,
      background: {
        file: audio,
        url: 'blob:audio',
        name: audio.name,
        duration: 6,
        sourceStart: 1,
        sourceEnd: 3,
        timelineStart: 0.5,
        timelineEnd: 4.5,
        volume: 0.6,
      },
    })
    const filter = command.args[command.args.indexOf('-filter_complex') + 1]

    expect(filter).toContain('atrim=start=1:end=3')
    expect(filter).toContain('aloop=loop=-1:size=96000')
    expect(filter).toContain('atrim=duration=4,adelay=500:all=1')
    expect(filter).toContain('volume=0.6')
    expect(filter).toContain('[abase][bg]amix=inputs=2')
  })
})
