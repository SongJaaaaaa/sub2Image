import { createPromptStudioTool, videoDomain, type PromptStudioToolBundle } from '../../features/promptStudio'
import { getAgentTextApiProfile } from '../../lib/apiProfiles'
import { useStore } from '../../store'
import { sub2ImageAssets } from './sub2ImageAssets'
import { sub2ImageStorage } from './sub2ImageStorage'
import { createSub2ImageTextModel } from './sub2ImageTextModel'

export function createSub2VideoPromptStudio(): PromptStudioToolBundle {
  const textModel = createSub2ImageTextModel({
    getAgentTextProfile: () => getAgentTextApiProfile(useStore.getState().settings),
    resolveImage: sub2ImageAssets.resolve,
    openAgentTextSettings: () => useStore.getState().setShowSettings(true, 'agent'),
  })

  return createPromptStudioTool({
    textModel,
    storage: sub2ImageStorage,
    assets: sub2ImageAssets,
    domains: [videoDomain],
    onError: (err) => useStore.getState().showToast(err instanceof Error ? err.message : String(err), 'error'),
  })
}
