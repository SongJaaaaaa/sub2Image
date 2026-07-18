import type { PromptSourceAsset, PromptStoredAssetRef } from '../types'

export interface PromptStudioAssets {
  save(asset: PromptSourceAsset): Promise<PromptStoredAssetRef>
  resolve(id: string): Promise<string | null>
  deleteIfUnused(id: string): Promise<void>
}
