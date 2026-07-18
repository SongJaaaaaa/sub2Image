import type {
  PromptStoredAssetRef,
  PromptStudioSource,
  PromptStudioSourceSnapshot,
} from '../types'

export function normalizePromptSource(source: PromptStudioSource): PromptStudioSource {
  return {
    type: source.type,
    ...(source.id != null ? { id: source.id.trim() } : {}),
    ...(source.title != null ? { title: source.title.trim() } : {}),
    ...(source.text != null ? { text: source.text.replace(/\r\n?/g, '\n') } : {}),
    ...(source.messages ? {
      messages: source.messages.map((msg) => ({
        role: msg.role,
        content: msg.content.replace(/\r\n?/g, '\n'),
        ...(msg.id != null ? { id: msg.id.trim() } : {}),
        ...(msg.createdAt != null ? { createdAt: msg.createdAt } : {}),
      })),
    } : {}),
    ...(source.assets ? {
      assets: source.assets.map((asset) => ({
        id: asset.id.trim(),
        type: asset.type,
        dataUrl: asset.dataUrl,
        label: asset.label.trim(),
        ...(asset.role ? { role: asset.role } : {}),
      })),
    } : {}),
    ...(source.metadata ? { metadata: { ...source.metadata } } : {}),
  }
}

export function createPromptSourceSnapshot(
  source: PromptStudioSource,
  storedAssets: readonly PromptStoredAssetRef[] = [],
): PromptStudioSourceSnapshot {
  const normalized = normalizePromptSource(source)
  const refs = new Map(storedAssets.map((asset) => [asset.id, asset]))
  const assets = normalized.assets?.map((asset) => {
    const ref = refs.get(asset.id)
    return {
      id: asset.id,
      type: asset.type,
      label: asset.label,
      ...(asset.role ? { role: asset.role } : {}),
      ...(ref?.width != null ? { width: ref.width } : {}),
      ...(ref?.height != null ? { height: ref.height } : {}),
    }
  })

  return {
    type: normalized.type,
    ...(normalized.id != null ? { id: normalized.id } : {}),
    ...(normalized.title != null ? { title: normalized.title } : {}),
    ...(normalized.text != null ? { text: normalized.text } : {}),
    ...(normalized.messages ? { messages: normalized.messages } : {}),
    ...(assets ? { assets } : {}),
    ...(normalized.metadata ? { metadata: normalized.metadata } : {}),
  }
}
