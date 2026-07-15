import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './apiProfiles'
import { syncSub2Settings } from './sub2Profiles'
import type { Sub2Config } from '../types'

function config(id: string, kind: Sub2Config['kind'], keyId = 1): Sub2Config {
  return {
    id,
    name: `${kind}-${id}`,
    kind,
    keyId,
    keyName: `key-${keyId}`,
    groupId: 2,
    groupName: 'usSub',
    platform: 'openai',
    model: kind === 'image' ? 'gpt-image-2' : 'gpt-5.5',
    profileId: `sub2api-${kind}-${id}`,
  }
}

describe('Sub2API profiles', () => {
  it('allows multiple configs to reuse the same key and separates agent profiles', () => {
    const configs = [config('a', 'image'), config('b', 'image'), config('c', 'text')]
    const settings = syncSub2Settings(DEFAULT_SETTINGS, configs, new Map([[1, 'sk-user']]))
    expect(settings.profiles).toHaveLength(3)
    expect(settings.profiles.every((item) => item.apiKey === 'sk-user')).toBe(true)
    expect(settings.agentTextProfileId).toBe('sub2api-text-c')
    expect(settings.agentImageProfileId).toBe('sub2api-image-a')
    expect(settings.activeProfileId).toBe('sub2api-image-a')
  })

  it('keeps saved profiles after logout when no key map is available', () => {
    const first = syncSub2Settings(DEFAULT_SETTINGS, [config('a', 'image')], new Map([[1, 'sk-user']]))
    const next = syncSub2Settings(first, first.sub2Configs, new Map())
    expect(next.profiles[0].apiKey).toBe('sk-user')
  })
})
