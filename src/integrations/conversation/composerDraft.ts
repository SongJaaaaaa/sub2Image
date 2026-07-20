import type { ComposerDraft } from '../../types'
import { remapImageMentionsForOrder } from '../../lib/promptImageMentions'
import { useStore } from '../../state/appStore'
import { orderImagesWithMaskFirst, syncActiveInputDraft } from '../../state/inputDrafts'

export function loadComposerDraft(): ComposerDraft {
  const state = useStore.getState()
  return {
    prompt: state.prompt,
    inputImages: state.inputImages.map((img) => ({ ...img })),
    maskDraft: state.maskDraft ? { ...state.maskDraft } : null,
    maskEditorImageId: state.maskEditorImageId,
    params: { ...state.params },
  }
}

export function composerDraftMatches(
  current: Pick<ComposerDraft, 'prompt' | 'inputImages' | 'maskDraft'>,
  draft: ComposerDraft,
) {
  return current.prompt === draft.prompt
    && current.inputImages.length === draft.inputImages.length
    && current.inputImages.every((img, idx) => img.id === draft.inputImages[idx]?.id)
    && current.maskDraft?.targetImageId === draft.maskDraft?.targetImageId
    && current.maskDraft?.maskDataUrl === draft.maskDraft?.maskDataUrl
}

export function applyComposerDraft(draft: ComposerDraft) {
  const sourceImages = draft.inputImages.map((img) => ({ ...img }))
  const maskDraft = draft.maskDraft && sourceImages.some((img) => img.id === draft.maskDraft?.targetImageId)
    ? { ...draft.maskDraft }
    : null
  const inputImages = orderImagesWithMaskFirst(sourceImages, maskDraft?.targetImageId)
  const prompt = remapImageMentionsForOrder(draft.prompt, sourceImages, inputImages)
  const maskEditorImageId = draft.maskEditorImageId && inputImages.some((img) => img.id === draft.maskEditorImageId)
    ? draft.maskEditorImageId
    : null

  useStore.setState((state) => ({
    ...syncActiveInputDraft(state, {
      prompt,
      inputImages,
      maskDraft,
      maskEditorImageId,
    }),
    ...(draft.params ? { params: { ...state.params, ...draft.params } } : {}),
  }))
}
