import { describe, expect, it } from 'vitest'
import { getVideoProvider, resolveVideoProviderId } from './registry'

describe('video provider registry', () => {
  it('registers Grok, Gemini and Jimeng providers', () => {
    expect(getVideoProvider('grok').id).toBe('grok')
    expect(getVideoProvider('gemini').id).toBe('gemini')
    expect(getVideoProvider('jimeng').id).toBe('jimeng')
  })

  it('resolves Gemini from platform or Veo model', () => {
    expect(resolveVideoProviderId('gemini', 'custom-model')).toBe('gemini')
    expect(resolveVideoProviderId('openai', 'veo-3.1-generate-preview')).toBe('gemini')
    expect(resolveVideoProviderId('grok', 'grok-imagine-video')).toBe('grok')
    expect(resolveVideoProviderId('grok', 'jimeng-video-3.5-pro')).toBe('jimeng')
  })
})
