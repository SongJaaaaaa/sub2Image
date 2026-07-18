import type { PromptStudioAssets } from '../../features/promptStudio'
import { storeImageWithSize } from '../../lib/db'
import { deleteImageIfUnreferenced, ensureImageCached } from '../../store'

export const sub2ImageAssets: PromptStudioAssets = {
  save: async (asset) => {
    const stored = await storeImageWithSize(asset.dataUrl, 'upload')
    return {
      id: stored.id,
      type: asset.type,
      label: asset.label,
      ...(asset.role ? { role: asset.role } : {}),
      ...(stored.width != null ? { width: stored.width } : {}),
      ...(stored.height != null ? { height: stored.height } : {}),
    }
  },
  resolve: async (id) => (await ensureImageCached(id)) ?? null,
  deleteIfUnused: deleteImageIfUnreferenced,
}
