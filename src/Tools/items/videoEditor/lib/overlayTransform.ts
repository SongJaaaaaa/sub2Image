import type { ImageOverlay } from '../types'

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function getOverlayHeight(overlay: ImageOverlay, stageWidth: number, stageHeight: number) {
  return overlay.width * stageWidth * overlay.sourceHeight / overlay.sourceWidth / stageHeight
}

export function resizeOverlay(overlay: ImageOverlay, scale: number) {
  const width = clamp(overlay.width * scale, 0.08, 1)
  return {
    ...overlay,
    width,
    x: clamp(overlay.x, 0, 1 - width),
  }
}

export function getRotation(clientX: number, clientY: number, centerX: number, centerY: number) {
  const degrees = Math.round(Math.atan2(clientY - centerY, clientX - centerX) * 180 / Math.PI + 90)
  return ((degrees + 180) % 360 + 360) % 360 - 180
}
