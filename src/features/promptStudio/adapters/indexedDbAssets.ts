import type { PromptProject, PromptSourceAsset, PromptStoredAssetRef } from '../types'
import type { PromptStudioAssets } from '../ports/assets'
import {
  openPromptStudioDatabase,
  PROMPT_ASSETS_STORE,
  PROMPT_PROJECTS_STORE,
  toPromptStudioIndexedDbError,
  waitForPromptStudioTransaction,
  type PromptStudioIndexedDbOptions,
} from './indexedDb'

type StoredPromptAsset = PromptStoredAssetRef & {
  dataUrl: string
  createdAt: number
}

export function createIndexedDbAssets(
  opts: PromptStudioIndexedDbOptions = {},
): PromptStudioAssets {
  return {
    async save(asset) {
      const stored: StoredPromptAsset = {
        id: asset.id,
        type: asset.type,
        dataUrl: asset.dataUrl,
        label: asset.label,
        ...(asset.role ? { role: asset.role } : {}),
        createdAt: Date.now(),
      }
      await putAsset(opts, stored)
      return toStoredAssetRef(stored)
    },
    async resolve(id) {
      const asset = await getAsset(opts, id)
      return asset?.dataUrl ?? null
    },
    async deleteIfUnused(id) {
      await deleteAssetIfUnused(opts, id)
    },
  }
}

async function putAsset(opts: PromptStudioIndexedDbOptions, asset: StoredPromptAsset) {
  try {
    const db = await openPromptStudioDatabase(opts)
    const tx = db.transaction(PROMPT_ASSETS_STORE, 'readwrite')
    tx.objectStore(PROMPT_ASSETS_STORE).put(asset)
    await waitForPromptStudioTransaction(tx, () => undefined)
  } catch (err) {
    throw toPromptStudioIndexedDbError(err, 'transaction')
  }
}

async function getAsset(opts: PromptStudioIndexedDbOptions, id: string) {
  try {
    const db = await openPromptStudioDatabase(opts)
    const tx = db.transaction(PROMPT_ASSETS_STORE, 'readonly')
    const req = tx.objectStore(PROMPT_ASSETS_STORE).get(id) as IDBRequest<StoredPromptAsset | undefined>
    return await waitForPromptStudioTransaction(tx, () => req.result)
  } catch (err) {
    throw toPromptStudioIndexedDbError(err, 'transaction')
  }
}

async function deleteAssetIfUnused(opts: PromptStudioIndexedDbOptions, id: string) {
  try {
    const db = await openPromptStudioDatabase(opts)
    const tx = db.transaction([PROMPT_PROJECTS_STORE, PROMPT_ASSETS_STORE], 'readwrite')
    const projects = tx.objectStore(PROMPT_PROJECTS_STORE).getAll() as IDBRequest<PromptProject[]>
    projects.onsuccess = () => {
      if (isAssetReferenced(projects.result, id)) return
      tx.objectStore(PROMPT_ASSETS_STORE).delete(id)
    }
    await waitForPromptStudioTransaction(tx, () => undefined)
  } catch (err) {
    throw toPromptStudioIndexedDbError(err, 'transaction')
  }
}

function isAssetReferenced(projects: readonly PromptProject[], id: string) {
  return projects.some((project) => project.source?.assets?.some((asset) => asset.id === id))
}

function toStoredAssetRef(asset: PromptSourceAsset | StoredPromptAsset): PromptStoredAssetRef {
  return {
    id: asset.id,
    type: asset.type,
    label: asset.label,
    ...(asset.role ? { role: asset.role } : {}),
    ...('width' in asset && asset.width != null ? { width: asset.width } : {}),
    ...('height' in asset && asset.height != null ? { height: asset.height } : {}),
  }
}
