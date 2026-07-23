import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from './apiProfiles'
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

  it('keeps a separate video Key and model configuration', () => {
    const settings = syncSub2Settings(
      DEFAULT_SETTINGS,
      [config('a', 'image', 1), config('b', 'text', 2), config('c', 'video', 3)],
      new Map([[1, 'image-key'], [2, 'text-key'], [3, 'video-key']]),
    )

    expect(settings.agentVideoProfileId).toBe('sub2api-video-c')
    expect(settings.profiles.find((item) => item.id === settings.agentVideoProfileId)).toMatchObject({
      apiKey: 'video-key',
      model: 'gpt-5.5',
      baseUrl: '/sub2api-v1',
    })
  })

  it('repairs legacy URLs for profiles bound to system configs', () => {
    const settings = syncSub2Settings(
      DEFAULT_SETTINGS,
      [config('a', 'image'), config('b', 'text')],
      new Map([[1, 'sk-user']]),
    )
    const next = normalizeSettings({
      ...settings,
      sub2Configs: [],
      profiles: settings.profiles.map((profile) => ({
        ...profile,
        baseUrl: 'https://sub2api-v1/v1',
        apiProxy: true,
      })),
    })

    expect(next.profiles.map((profile) => profile.baseUrl)).toEqual(['/sub2api-v1', '/sub2api-v1'])
    expect(next.profiles.every((profile) => !profile.apiProxy)).toBe(true)
  })
})
