import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import classWorkerURL from '@ffmpeg/ffmpeg/worker?url'
import type { ExportProject, ExportQuality, ExportRatio } from '../types'
import { getProjectDuration } from './media'
import { renderSubtitleFiles, type SubtitleRenderFile } from './subtitleRender'

let ffmpeg: FFmpeg | null = null

export function getExportSize(ratio: ExportRatio, quality: ExportQuality) {
  const long = quality === '1080p' ? 1920 : 1280
  const short = quality === '1080p' ? 1080 : 720
  if (ratio === '9:16') return { width: short, height: long }
  if (ratio === '1:1') return { width: short, height: short }
  return { width: long, height: short }
}

export function createExportCommand(project: ExportProject, subtitleFiles: SubtitleRenderFile[] = []) {
  const sources = project.sources.filter((source) => project.clips.some((clip) => clip.sourceId === source.id))
  const subtitleIdx = sources.length + project.overlays.length
  const bgIdx = subtitleIdx + subtitleFiles.length
  const size = getExportSize(project.ratio, project.quality)
  const total = getProjectDuration(project.clips)
  const filters: string[] = []
  const videoLabels: string[] = []
  const useOriginal = !project.muted && project.originalVolume > 0

  project.clips.forEach((clip, idx) => {
    const source = sources.find((item) => item.id === clip.sourceId)!
    const input = sources.indexOf(source)
    const duration = clip.sourceEnd - clip.sourceStart
    filters.push(`[${input}:v]trim=start=${clip.sourceStart}:end=${clip.sourceEnd},setpts=PTS-STARTPTS,fps=30,scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${idx}]`)
    videoLabels.push(`[v${idx}]`)
    if (!useOriginal) return
    filters.push(source.hasAudio
      ? `[${input}:a]atrim=start=${clip.sourceStart}:end=${clip.sourceEnd},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${project.originalVolume}[a${idx}]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[a${idx}]`)
  })

  if (useOriginal) {
    filters.push(project.clips.map((_, idx) => `[v${idx}][a${idx}]`).join('') + `concat=n=${project.clips.length}:v=1:a=1[vbase][abase]`)
  } else {
    filters.push(`${videoLabels.join('')}concat=n=${project.clips.length}:v=1:a=0[vbase]`)
  }

  let outputLabel = 'vbase'
  project.overlays.forEach((overlay, idx) => {
    const input = sources.length + idx
    const width = Math.max(1, Math.round(size.width * overlay.width))
    const height = Math.max(1, Math.round(width * overlay.sourceHeight / overlay.sourceWidth))
    const radians = overlay.rotation * Math.PI / 180
    const rotatedWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))
    const rotatedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
    const x = Math.round(size.width * overlay.x + (width - rotatedWidth) / 2)
    const y = Math.round(size.height * overlay.y + (height - rotatedHeight) / 2)
    const nextLabel = `vOverlay${idx}`
    filters.push(`[${input}:v]scale=${width}:-1,format=rgba,rotate=${overlay.rotation}*PI/180:ow=rotw(iw):oh=roth(ih):c=none,colorchannelmixer=aa=${overlay.opacity}[overlay${idx}]`)
    filters.push(`[${outputLabel}][overlay${idx}]overlay=x=${x}:y=${y}:enable='between(t,${overlay.start},${overlay.end})':eof_action=pass[${nextLabel}]`)
    outputLabel = nextLabel
  })

  subtitleFiles.forEach((subtitle, idx) => {
    const input = subtitleIdx + idx
    const nextLabel = `vSubtitle${idx}`
    filters.push(`[${input}:v]format=rgba[subtitle${idx}]`)
    filters.push(`[${outputLabel}][subtitle${idx}]overlay=x=${subtitle.x}:y=${subtitle.y}:enable='between(t,${subtitle.start},${subtitle.end})':eof_action=pass[${nextLabel}]`)
    outputLabel = nextLabel
  })

  if (project.background) {
    const sourceLength = project.background.sourceEnd - project.background.sourceStart
    const timelineLength = project.background.timelineEnd - project.background.timelineStart
    const samples = Math.max(1, Math.round(sourceLength * 48000))
    const delay = Math.round(project.background.timelineStart * 1000)
    filters.push(`[${bgIdx}:a]atrim=start=${project.background.sourceStart}:end=${project.background.sourceEnd},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,aloop=loop=-1:size=${samples},atrim=duration=${timelineLength},adelay=${delay}:all=1,volume=${project.background.volume},apad,atrim=duration=${total}[bg]`)
    filters.push(useOriginal ? '[abase][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]' : '[bg]anull[aout]')
  }

  const files: Array<{ name: string, file: Blob, loop?: boolean }> = sources.map((source, idx) => ({ name: `video-${idx}.${source.file.name.split('.').pop() || 'mp4'}`, file: source.file }))
  project.overlays.forEach((overlay, idx) => files.push({ name: `overlay-${idx}.${overlay.file.name.split('.').pop() || 'png'}`, file: overlay.file, loop: true }))
  subtitleFiles.forEach((subtitle) => files.push({ name: subtitle.name, file: subtitle.file, loop: true }))
  if (project.background) files.push({ name: `background.${project.background.file.name.split('.').pop() || 'mp3'}`, file: project.background.file })
  const args = files.flatMap((file) => file.loop ? ['-loop', '1', '-i', file.name] : ['-i', file.name])
  args.push('-filter_complex', filters.join(';'), '-map', `[${outputLabel}]`)
  if (useOriginal || project.background) args.push('-map', project.background ? '[aout]' : '[abase]', '-c:a', 'aac', '-b:a', '192k')
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', total.toString(), 'output.mp4')
  return { files, args }
}

export async function exportVideo(project: ExportProject, onProgress: (value: number) => void) {
  ffmpeg ||= new FFmpeg()
  const worker = ffmpeg
  if (!worker.loaded) {
    onProgress(0.02)
    await worker.load({ coreURL, wasmURL, classWorkerURL })
  }
  const size = getExportSize(project.ratio, project.quality)
  const subtitleFiles = await renderSubtitleFiles(project.subtitles, project.subtitleStyle, size, (value) => onProgress(0.02 + value * 0.06))
  const command = createExportCommand(project, subtitleFiles)

  const progress = ({ progress }: { progress: number }) => onProgress(Math.min(0.99, 0.15 + Math.max(0, progress) * 0.84))
  worker.on('progress', progress)
  try {
    for (let idx = 0; idx < command.files.length; idx += 1) {
      const item = command.files[idx]
      await worker.writeFile(item.name, await fetchFile(item.file))
      onProgress(0.08 + ((idx + 1) / command.files.length) * 0.06)
    }
    const code = await worker.exec(command.args)
    if (code !== 0) throw new Error(`FFmpeg 处理失败，退出码 ${code}`)
    const data = await worker.readFile('output.mp4')
    onProgress(1)
    return new Blob([new Uint8Array(data as Uint8Array).buffer], { type: 'video/mp4' })
  } finally {
    worker.off('progress', progress)
    if (worker.loaded) {
      for (const item of command.files) {
        try {
          await worker.deleteFile(item.name)
        } catch (err) {
          console.warn('清理 FFmpeg 输入文件失败', err)
        }
      }
      try {
        await worker.deleteFile('output.mp4')
      } catch {
        // 导出失败时不会生成输出文件。
      }
    }
  }
}

export function cancelVideoExport() {
  ffmpeg?.terminate()
  ffmpeg = null
}
