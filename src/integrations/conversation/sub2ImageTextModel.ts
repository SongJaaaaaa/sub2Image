import {
  createOpenAiResponsesTextModel,
  type OpenAiResponsesTextModelOptions,
  type TextModelPort,
} from '../../features/promptStudio'
import { validateApiProfile } from '../../lib/apiProfiles'
import { buildApiUrl, readClientDevProxyConfig, shouldUseApiProxy } from '../../lib/devProxy'
import { createRequestAbortScope, getApiErrorMessage } from '../../lib/imageApiShared'
import type { ApiProfile } from '../../types'

export type Sub2ImageTextModelOptions = {
  getAgentTextProfile: () => ApiProfile | null
  resolveImage?: OpenAiResponsesTextModelOptions['resolveImage']
  fetch?: typeof globalThis.fetch
  openAgentTextSettings?: () => void
}

export function createSub2ImageTextModel(opts: Sub2ImageTextModelOptions): TextModelPort {
  const configError = (message: string): never => {
    opts.openAgentTextSettings?.()
    throw new Error(message)
  }

  return createOpenAiResponsesTextModel({
    getConfig: () => {
      const profile = opts.getAgentTextProfile()
      if (!profile) return configError('未配置 Agent 文本模型，请先在设置中选择文本模型配置。')
      if (profile.provider !== 'openai') {
        return configError('提示词工作台需要使用 OpenAI provider 的文本模型配置。')
      }
      if (profile.apiMode !== 'responses') {
        return configError('提示词工作台需要使用 Responses API 模式的文本模型配置。')
      }
      const error = validateApiProfile(profile)
      if (error) return configError(`文本模型 API 配置不完整：${error}`)
      if (!Number.isFinite(profile.timeout) || profile.timeout <= 0) {
        return configError('文本模型 API 配置不完整：请求超时时间无效')
      }

      const proxyConfig = readClientDevProxyConfig()
      return {
        endpoint: buildApiUrl(profile.baseUrl, 'responses', proxyConfig, shouldUseApiProxy(profile.apiProxy, proxyConfig)),
        apiKey: profile.apiKey,
        model: profile.model,
        timeoutMs: profile.timeout * 1000,
      }
    },
    resolveImage: opts.resolveImage,
    fetch: opts.fetch,
    getErrorMessage: getApiErrorMessage,
    createAbortScope: createRequestAbortScope,
  })
}
