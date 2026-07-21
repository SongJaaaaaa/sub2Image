import { describe, expect, it } from 'vitest'
import type { ImageOverlay } from '../types'
import { getOverlayHeight, getRotation, resizeOverlay } from '../lib/overlayTransform'

const overlay = {
  id: 'overlay-1',
  file: new File(['image'], 'image.png'),
  url: 'blob:image',
  name: 'image.png',
  sourceWidth: 800,
  sourceHeight: 400,
  start: 0,
  end: 3,
  x: 0.7,
  y: 0.2,
  width: 0.2,
  rotation: 0,
  opacity: 1,
} satisfies ImageOverlay

describe('image overlay transform', () => {
  it('keeps resized overlays inside the canvas', () => {
    expect(resizeOverlay(overlay, 2)).toMatchObject({ width: 0.4, x: 0.6 })
  })

  it('maps pointer direction to rotation degrees', () => {
    expect(getRotation(100, 50, 100, 100)).toBe(0)
    expect(getRotation(150, 100, 100, 100)).toBe(90)
  })

  it('calculates overlay height against the canvas ratio', () => {
    expect(getOverlayHeight(overlay, 1280, 720)).toBeCloseTo(0.1778, 3)
  })
})
