import type { FavoriteCollection, TaskRecord } from '../../types'
import {
  ALL_FAVORITES_COLLECTION_ID,
  ensureDefaultFavoriteCollection,
  ensureDefaultNamedCollection,
  getDefaultNamedFavoriteCollectionId,
  normalizeFavoriteCollections,
  resolveDefaultFavoriteCollectionId,
} from './favoriteCollections'

export function normalizeFavoriteCollectionIds(ids: unknown) {
  if (!Array.isArray(ids)) return []
  return Array.from(new Set(ids.map(String).filter((id) => id && id !== ALL_FAVORITES_COLLECTION_ID)))
}

export function sameFavoriteCollectionIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const bSet = new Set(b)
  return a.every((id) => bSet.has(id))
}

export function normalizeFavoritePatch(task: TaskRecord, patch: Partial<TaskRecord>, defaultFavoriteCollectionId: string | null): Partial<TaskRecord> {
  if ('favoriteCollectionIds' in patch) {
    const ids = normalizeFavoriteCollectionIds(patch.favoriteCollectionIds)
    return { ...patch, favoriteCollectionIds: ids, isFavorite: ids.length > 0 }
  }
  if ('isFavorite' in patch) {
    if (patch.isFavorite) {
      const ids = normalizeFavoriteCollectionIds(task.favoriteCollectionIds)
      return { ...patch, favoriteCollectionIds: ids.length ? ids : defaultFavoriteCollectionId ? [defaultFavoriteCollectionId] : [] }
    }
    return { ...patch, favoriteCollectionIds: [] }
  }
  return patch
}

function normalizeTaskFavoriteState(task: TaskRecord, collections: FavoriteCollection[]): TaskRecord {
  const collectionIds = new Set(collections.map((collection) => collection.id))
  const normalizedIds = normalizeFavoriteCollectionIds(task.favoriteCollectionIds).filter((id) => collectionIds.has(id))
  const defaultId = getDefaultNamedFavoriteCollectionId(collections)
  const ids = normalizedIds.length > 0 ? normalizedIds : task.isFavorite && defaultId ? [defaultId] : []
  const isFavorite = ids.length > 0 || Boolean(task.isFavorite)
  if (ids.length === (task.favoriteCollectionIds ?? []).length && ids.every((id, idx) => id === task.favoriteCollectionIds?.[idx]) && Boolean(task.isFavorite) === isFavorite) {
    return task
  }
  return { ...task, favoriteCollectionIds: ids, isFavorite }
}

export function normalizeLoadedFavoriteState(tasks: TaskRecord[], collections: FavoriteCollection[], preferredDefaultFavoriteCollectionId: string | null) {
  let changed = false
  const normalizedCollections = ensureDefaultNamedCollection(ensureDefaultFavoriteCollection(normalizeFavoriteCollections(collections)))
  const defaultFavoriteCollectionId = resolveDefaultFavoriteCollectionId(normalizedCollections, preferredDefaultFavoriteCollectionId)
  const normalizedTasks = tasks.map((task) => {
    const next = normalizeTaskFavoriteState(task, normalizedCollections)
    if (next !== task) changed = true
    return next
  })
  return { tasks: normalizedTasks, collections: normalizedCollections, defaultFavoriteCollectionId, changed }
}
