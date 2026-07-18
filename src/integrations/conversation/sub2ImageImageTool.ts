import type { ConversationTool } from '../../features/conversationComposer'
import { getActiveApiProfile, normalizeSettings, validateApiProfile } from '../../lib/apiProfiles'
import { submitTask, useStore } from '../../store'
import type { ComposerDraft } from '../../types'
import { imageGenerationMessageRenderers } from './conversationMessageRenderers'

export const SUB2_IMAGE_TOOL_ID = 'sub2-image'

type SubmitImage = (options?: {
  allowFullMask?: boolean
  useCurrentApiProfileWhenReusedMissing?: boolean
  signal?: AbortSignal
  draft?: ComposerDraft
}) => Promise<void>

type ImageSubmitPayload = {
  draft: ComposerDraft
}

export type Sub2ImageImageToolOptions = {
  getState?: typeof useStore.getState
  submit?: SubmitImage
}

export function createSub2ImageImageTool(opts: Sub2ImageImageToolOptions = {}): ConversationTool {
  const getState = opts.getState ?? useStore.getState
  const submit = opts.submit ?? (submitTask as SubmitImage)

  return {
    id: SUB2_IMAGE_TOOL_ID,
    label: '画廊',
    getComposerState: (args) => {
      const state = getState()
      const settings = normalizeSettings(state.settings)
      const settingsProfile = getActiveApiProfile(settings)
      const profile = settings.reuseTaskApiProfileTemporarily && state.reusedTaskApiProfileId
        ? settings.profiles.find((item) => item.id === state.reusedTaskApiProfileId) ?? settingsProfile
        : settingsProfile
      const error = validateApiProfile(profile)

      return {
        placeholder: '描述你想生成的图片...',
        canSubmit: Boolean(args.input.text.trim()) && !args.running,
        validationError: error ? `请求 API 配置不完整：${error}` : null,
        running: args.running,
      }
    },
    load: async () => {
      const { default: Controls } = await import('./Sub2ImageImageToolControls')
      return {
        Controls,
        messageRenderers: imageGenerationMessageRenderers,
        validate: (input) => input.text.trim() ? null : '请输入提示词',
        submit: async (input, _ctx, signal) => {
          const payload = input.payload as ImageSubmitPayload | undefined
          await submit({ signal, draft: payload?.draft })
        },
      }
    },
  }
}

export const sub2ImageImageTool = createSub2ImageImageTool()
