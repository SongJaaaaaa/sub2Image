import type { ConversationTool } from '../../features/conversationComposer'
import { submitVideoTask } from '../../features/video'
import { getAgentVideoApiProfile, normalizeSettings, validateApiProfile } from '../../lib/apiProfiles'
import { useStore } from '../../store'
import type { ComposerDraft } from '../../types'
import { getVideoProvider, resolveVideoProviderId, type VideoParams, type VideoProfile } from '../../videoIntegrations'

export const SUB2_VIDEO_TOOL_ID = 'video'

type VideoSubmitPayload = {
  draft: ComposerDraft
  videoParams: VideoParams
}

function getVideoContext() {
  const settings = normalizeSettings(useStore.getState().settings)
  const profile = getAgentVideoApiProfile(settings)
  const config = settings.sub2Configs.find((item) => item.profileId === profile?.id)
  const providerId = resolveVideoProviderId(config?.platform, profile?.model)
  const videoProfile: VideoProfile = {
    id: profile?.id || '',
    name: profile?.name || '',
    provider: providerId,
    baseUrl: profile?.baseUrl || '',
    apiKey: profile?.apiKey || '',
    model: profile?.model || '',
    timeout: profile?.timeout || 600,
  }
  return { profile, provider: getVideoProvider(providerId), videoProfile }
}

function getImageError(count: number) {
  if (!count) return null
  const { provider, videoProfile } = getVideoContext()
  const capabilities = provider.getCapabilities(videoProfile)
  if (!capabilities.modes.includes('image-to-video')) return '当前视频模型不支持图生视频'
  if (count > capabilities.maxImages) return `当前视频模型最多支持 ${capabilities.maxImages} 张输入图`
  return null
}

export function createSub2VideoTool(): ConversationTool {
  return {
    id: SUB2_VIDEO_TOOL_ID,
    label: '视频',
    getComposerState: (args) => {
      const { profile } = getVideoContext()
      const error = profile ? validateApiProfile(profile) : '请先在设置 > Agent 配置中选择视频 Key 和模型'
      return {
        placeholder: '描述你想生成的视频...',
        canSubmit: Boolean(args.input.text.trim()) && !args.running,
        validationError: error ? `视频模型配置不完整：${error}` : getImageError(args.input.attachments.length),
        running: args.running,
      }
    },
    load: async () => ({
      messageRenderers: {},
      validate: (input) => {
        if (!input.text.trim()) return '请输入提示词'
        return getImageError(input.attachments.length)
      },
      submit: async (input, _ctx, signal) => {
        const payload = input.payload as VideoSubmitPayload | undefined
        if (!payload) throw new Error('视频任务参数缺失')
        await submitVideoTask({ draft: payload.draft, params: payload.videoParams, signal })
      },
    }),
  }
}

export const sub2VideoTool = createSub2VideoTool()
