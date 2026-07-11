import type { ApiProfile, AppSettings, Sub2Config } from '../types'

export const SUB2_ONLY_VERSION = 1
export const SUB2_PLACEHOLDER_PROFILE_ID = 'sub2api-unconfigured-image'

export function isSub2TextProfile(profile: ApiProfile) {
  return profile.id.startsWith('sub2api-text-')
}

export function isSub2ImageProfile(profile: ApiProfile) {
  return profile.id.startsWith('sub2api-image-')
}

export function isImageModel(model: string) {
  const id = model.toLowerCase()
  return !id.includes('video') && (id.includes('image') || id.includes('imagine'))
}

export function filterSub2Models(models: string[], kind: Sub2Config['kind']) {
  return models.filter((model) => kind === 'image'
    ? isImageModel(model)
    : !isImageModel(model) && !model.toLowerCase().includes('video'))
}

export function createSub2PlaceholderProfile(): ApiProfile {
  return {
    id: SUB2_PLACEHOLDER_PROFILE_ID,
    name: '尚未配置 Sub2API',
    provider: 'openai',
    baseUrl: '/sub2api-v1',
    apiKey: '',
    model: 'gpt-image-2',
    timeout: 600,
    apiMode: 'images',
    codexCli: false,
    apiProxy: false,
    streamImages: false,
  }
}

export function createSub2Profile(config: Sub2Config, apiKey: string): ApiProfile {
  return {
    id: config.profileId,
    name: config.name,
    provider: 'openai',
    baseUrl: '/sub2api-v1',
    apiKey,
    model: config.model,
    timeout: 600,
    apiMode: config.kind === 'text' ? 'responses' : 'images',
    codexCli: false,
    apiProxy: false,
    streamImages: config.kind === 'text',
  }
}

export function syncSub2Settings(settings: AppSettings, configs: Sub2Config[], keys: Map<number, string>, preferredActiveId?: string): AppSettings {
  const oldProfiles = new Map(settings.profiles.map((profile) => [profile.id, profile]))
  const profiles = configs.map((config) => createSub2Profile(config, keys.get(config.keyId) ?? oldProfiles.get(config.profileId)?.apiKey ?? ''))
  const nextProfiles = profiles.length ? profiles : [createSub2PlaceholderProfile()]
  const textIds = configs.filter((item) => item.kind === 'text').map((item) => item.profileId)
  const imageIds = configs.filter((item) => item.kind === 'image').map((item) => item.profileId)
  const activeProfileId = preferredActiveId && imageIds.includes(preferredActiveId)
    ? preferredActiveId
    : imageIds.includes(settings.activeProfileId) ? settings.activeProfileId : imageIds[0] ?? nextProfiles[0].id
  const agentTextProfileId = textIds.includes(settings.agentTextProfileId || '') ? settings.agentTextProfileId : textIds[0] ?? null
  const agentImageProfileId = imageIds.includes(settings.agentImageProfileId || '') ? settings.agentImageProfileId : imageIds[0] ?? null

  return {
    ...settings,
    sub2OnlyVersion: SUB2_ONLY_VERSION,
    sub2Configs: configs,
    profiles: nextProfiles,
    activeProfileId,
    agentApiConfigMode: 'hybrid',
    agentTextProfileId,
    agentImageProfileId,
  }
}
