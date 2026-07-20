import type { ApiProfile, AppSettings } from '../../types'
import { getAgentImageApiProfile, getAgentTextApiProfile, normalizeSettings, validateApiProfile } from '../../lib/apiProfiles'

export function getAgentProfileValidationError(settings: AppSettings): { profile: ApiProfile | null; message: string } | null {
  const normalized = normalizeSettings(settings)
  const textProfile = getAgentTextApiProfile(normalized)
  if (!textProfile || textProfile.provider !== 'openai' || textProfile.apiMode !== 'responses') {
    return { profile: textProfile, message: 'Agent 模式需要使用支持 Responses API 的 OpenAI 兼容文本模型配置。' }
  }
  const textProfileError = validateApiProfile(textProfile)
  if (textProfileError) return { profile: textProfile, message: `文本模型 API 配置不完整：${textProfileError}` }

  if (normalized.agentApiConfigMode === 'hybrid') {
    const imageProfile = getAgentImageApiProfile(normalized)
    if (!imageProfile) return { profile: null, message: '图像模型 API 配置不存在，请在 Agent 配置页选择可用的图像模型配置。' }
    const imageProfileError = validateApiProfile(imageProfile)
    if (imageProfileError) return { profile: imageProfile, message: `图像模型 API 配置不完整：${imageProfileError}` }
  }
  return null
}
