import { describe, expect, it } from 'vitest'
import { normalizeBackgroundRemovalPublicPath } from './backgroundRemoval'

describe('background removal public path', () => {
  it('keeps an empty value for the default IMG.LY CDN', () => {
    expect(normalizeBackgroundRemovalPublicPath(undefined)).toBe('')
    expect(normalizeBackgroundRemovalPublicPath('  ')).toBe('')
  })

  it('normalizes local and absolute model paths with a trailing slash', () => {
    expect(normalizeBackgroundRemovalPublicPath('/models/background-removal')).toBe('/models/background-removal/')
    expect(normalizeBackgroundRemovalPublicPath('https://static.example.com/background-removal/')).toBe('https://static.example.com/background-removal/')
  })
})
