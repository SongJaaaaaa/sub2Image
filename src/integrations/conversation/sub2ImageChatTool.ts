import type { ConversationTool } from '../../features/conversationComposer'
import { getAgentImageApiProfile, getAgentTextApiProfile, normalizeSettings, validateApiProfile } from '../../lib/apiProfiles'
import { stopAgentResponse, submitAgentMessage, useStore } from '../../store'
import type { ComposerDraft } from '../../types'
import { agentMessageRenderers } from './conversationMessageRenderers'

export const SUB2_CHAT_TOOL_ID = 'sub2-chat'

type SubmitChat = (options?: {
  signal?: AbortSignal
  draft?: ComposerDraft
  conversationId?: string
  editingRoundId?: string | null
}) => Promise<void>

type ChatSubmitPayload = {
  draft: ComposerDraft
  editingRoundId: string | null
}

export type Sub2ImageChatToolOptions = {
  getState?: typeof useStore.getState
  submit?: SubmitChat
  stop?: (conversationId?: string | null) => void
}

export function createSub2ImageChatTool(opts: Sub2ImageChatToolOptions = {}): ConversationTool {
  const getState = opts.getState ?? useStore.getState
  const submit = opts.submit ?? (submitAgentMessage as SubmitChat)
  const stop = opts.stop ?? stopAgentResponse

  return {
    id: SUB2_CHAT_TOOL_ID,
    label: 'Agent',
    getComposerState: (args) => {
      const state = getState()
      const settings = normalizeSettings(state.settings)
      const textProfile = getAgentTextApiProfile(settings)
      const imageProfile = getAgentImageApiProfile(settings)
      const textError = !textProfile || textProfile.provider !== 'openai' || textProfile.apiMode !== 'responses'
        ? 'Agent 模式需要使用支持 Responses API 的 OpenAI 兼容文本模型配置。'
        : validateApiProfile(textProfile)
      const imageError = settings.agentApiConfigMode === 'hybrid'
        ? imageProfile ? validateApiProfile(imageProfile) : '图像模型 API 配置不存在'
        : null
      const conversation = state.agentConversations.find((item) => item.id === args.conversationId)
      const conversationRunning = Boolean(conversation?.rounds.some((round) => round.status === 'running'))
      const running = args.running || conversationRunning

      return {
        placeholder: '输入消息...',
        canSubmit: Boolean(args.input.text.trim()) && !running,
        validationError: textError || imageError,
        running,
      }
    },
    load: async () => {
      return {
        messageRenderers: agentMessageRenderers,
        validate: (input) => input.text.trim() ? null : '请输入消息',
        submit: async (input, ctx, signal) => {
          const payload = input.payload as ChatSubmitPayload | undefined
          await submit({
            signal,
            draft: payload?.draft,
            conversationId: ctx.conversationId,
            editingRoundId: payload?.editingRoundId,
          })
        },
        stop: (ctx) => stop(ctx.conversationId),
      }
    },
  }
}

export const sub2ImageChatTool = createSub2ImageChatTool()
