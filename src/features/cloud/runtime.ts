import { useSyncExternalStore } from 'react'

import type { FavoriteCollection, TaskRecord } from '../../types'
import {
  agentSkills,
  getUploadedAgentSkillDoc,
  restoreAgentSkill,
} from '../../Skills'
import {
  getSub2Token,
  OPEN_SUB2_CONNECT_EVENT,
  SUB2_AUTH_CHANGED_EVENT,
  SUB2_AUTH_STORAGE_KEY,
} from '../../lib/sub2api'
import { useStore } from '../../state/appStore'
import { putTask } from '../tasks/taskPersistence'
import {
  getCloudAccount,
  listCloudTasks,
  removeCloudSkill,
  removeCloudTask,
  saveCloudSkill,
} from './api'
import {
  clearCloudAssetRegistry,
  ensureCloudAssetCached,
  loadCloudBootstrap,
  registerCloudAssets,
} from './cache'
import { saveTaskToCloud } from './taskUpload'
import type {
  CloudAccount,
  CloudSkill,
  CloudTask,
  CloudTaskBatchResult,
  CloudTaskProgress,
} from './types'

export type CloudItemState = {
  status: 'saving' | 'saved' | 'removing' | 'error'
  error?: string
}

type CloudRuntimeState = {
  account: CloudAccount | null
  syncing: boolean
  tasks: Record<string, CloudItemState>
  skills: Record<string, CloudItemState>
}

type CloudTaskPayload = TaskRecord & {
  cloudFavoriteCollections?: FavoriteCollection[]
}

const listeners = new Set<() => void>()
let state: CloudRuntimeState = {
  account: null,
  syncing: false,
  tasks: {},
  skills: {},
}
let started = false
let syncPromise: Promise<void> | null = null
let syncPromiseVersion: number | null = null
let syncVersion = 0
let syncController: AbortController | null = null
const transferControllers = new Set<AbortController>()

function emit(next: CloudRuntimeState) {
  state = next
  listeners.forEach((listener) => listener())
}

function setTaskState(id: string, value?: CloudItemState) {
  const tasks = { ...state.tasks }
  if (value) tasks[id] = value
  else delete tasks[id]
  emit({ ...state, tasks })
}

function setSkillState(id: string, value?: CloudItemState) {
  const skills = { ...state.skills }
  if (value) skills[id] = value
  else delete skills[id]
  emit({ ...state, skills })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCloudRuntimeState() {
  return state
}

export function useCloudRuntimeState() {
  return useSyncExternalStore(subscribe, getCloudRuntimeState, getCloudRuntimeState)
}

export function useCloudTaskState(id: string) {
  return useSyncExternalStore(
    subscribe,
    () => state.tasks[id],
    () => state.tasks[id],
  )
}

export function useCloudSkillState(id: string) {
  return useSyncExternalStore(
    subscribe,
    () => state.skills[id],
    () => state.skills[id],
  )
}

export function isCloudTaskSaved(id: string) {
  return state.tasks[id]?.status === 'saved'
}

function getTaskPayload(task: TaskRecord): CloudTaskPayload {
  const collections = useStore.getState().favoriteCollections.filter((collection) =>
    task.favoriteCollectionIds?.includes(collection.id),
  )
  return collections.length ? { ...task, cloudFavoriteCollections: collections } : task
}

export async function saveTaskWithCloudState(
  task: TaskRecord,
  onProgress?: (progress: CloudTaskProgress) => void,
) {
  if (!getSub2Token()) {
    window.dispatchEvent(new Event(OPEN_SUB2_CONNECT_EVENT))
    throw new Error('请先登录 Sub2API')
  }
  const version = syncVersion
  const controller = new AbortController()
  transferControllers.add(controller)
  setTaskState(task.id, { status: 'saving' })
  try {
    const saved = await saveTaskToCloud(getTaskPayload(task), {
      onProgress,
      signal: controller.signal,
    })
    if (version !== syncVersion) throw new Error('云端保存已取消')
    registerCloudAssets(saved.assets)
    setTaskState(task.id, { status: 'saved' })
    return saved
  } catch (err) {
    const error = version === syncVersion
      ? err instanceof Error ? err : new Error(String(err))
      : new Error('云端保存已取消')
    if (version === syncVersion) setTaskState(task.id, { status: 'error', error: error.message })
    throw error
  } finally {
    transferControllers.delete(controller)
  }
}

export async function saveTasksWithCloudState(
  tasks: readonly TaskRecord[],
  onProgress?: (progress: CloudTaskProgress) => void,
): Promise<CloudTaskBatchResult> {
  const saved: CloudTask[] = []
  const failed: CloudTaskBatchResult['failed'] = []
  const version = syncVersion
  for (const [index, task] of tasks.entries()) {
    if (version !== syncVersion) {
      failed.push(...tasks.slice(index).map((item) => ({
        taskId: item.id,
        error: new Error('账号已切换，云端保存已取消'),
      })))
      break
    }
    try {
      saved.push(await saveTaskWithCloudState(task, onProgress))
    } catch (err) {
      failed.push({
        taskId: task.id,
        error: err instanceof Error ? err : new Error(String(err)),
      })
    }
  }
  return { saved, failed }
}

export async function autoSaveTaskToCloud(task: TaskRecord) {
  const current = useStore.getState()
  if (!current.settings.cloudAutoSave || !getSub2Token()) return
  const version = syncVersion
  try {
    await saveTaskWithCloudState(task)
  } catch (err) {
    if (version !== syncVersion) return
    console.warn('自动保存任务到云端失败：', err)
    current.showToast('任务自动保存到云端失败，可在画廊重试', 'error')
  }
}

export async function removeTaskFromCloud(id: string) {
  const version = syncVersion
  const task = useStore.getState().tasks.find((item) => item.id === id)
  if (!task) throw new Error('找不到本地任务')
  const controller = new AbortController()
  const previous = state.tasks[id]
  transferControllers.add(controller)
  setTaskState(id, { status: 'removing' })
  try {
    const remote = (await listCloudTasks(controller.signal)).find((item) => item.id === id)
    if (remote) {
      registerCloudAssets(remote.assets)
      const assets = [...new Map(remote.assets.map((asset) => [asset.assetId, asset])).values()]
      for (const asset of assets) {
        if (controller.signal.aborted) throw new Error('移出云端已取消')
        await ensureCloudAssetCached(asset, controller.signal)
      }

      const { cloudFavoriteCollections: _collections, ...latest } = remote.task as CloudTaskPayload
      await putTask(latest)
      if (version !== syncVersion) throw new Error('移出云端已取消')
      const current = useStore.getState()
      const collectionIds = new Set(current.favoriteCollections.map((collection) => collection.id))
      const collections = getRemoteCollections([remote]).filter((collection) => !collectionIds.has(collection.id))
      if (collections.length) current.setFavoriteCollections([...current.favoriteCollections, ...collections])
      current.setTasks(current.tasks.map((item) => item.id === id ? latest : item))
    }
    await removeCloudTask(id, controller.signal)
    if (version !== syncVersion) throw new Error('移出云端已取消')
    setTaskState(id)
  } catch (err) {
    if (version === syncVersion) setTaskState(id, previous ?? { status: 'saved' })
    throw version === syncVersion
      ? err
      : new Error('移出云端已取消')
  } finally {
    transferControllers.delete(controller)
  }
}

export async function saveSkillWithCloudState(id: string) {
  if (!getSub2Token()) {
    window.dispatchEvent(new Event(OPEN_SUB2_CONNECT_EVENT))
    throw new Error('请先登录 Sub2API')
  }
  const doc = getUploadedAgentSkillDoc(id)
  if (!doc) throw new Error('找不到本地 Skill 文件')
  const version = syncVersion
  const controller = new AbortController()
  transferControllers.add(controller)
  setSkillState(id, { status: 'saving' })
  try {
    const saved = await saveCloudSkill(doc.id, doc.version, doc.fileName, doc.raw, controller.signal)
    if (version !== syncVersion) throw new Error('云端保存已取消')
    setSkillState(id, { status: 'saved' })
    return saved
  } catch (err) {
    const error = version === syncVersion
      ? err instanceof Error ? err : new Error(String(err))
      : new Error('云端保存已取消')
    if (version === syncVersion) setSkillState(id, { status: 'error', error: error.message })
    throw error
  } finally {
    transferControllers.delete(controller)
  }
}

export async function autoSaveSkillToCloud(id: string) {
  const current = useStore.getState()
  if (!current.settings.cloudAutoSave || !getSub2Token()) return
  const version = syncVersion
  try {
    await saveSkillWithCloudState(id)
  } catch (err) {
    if (version !== syncVersion) return
    console.warn('自动保存 Skill 到云端失败：', err)
    current.showToast('Skill 自动保存到云端失败，可在详情页重试', 'error')
  }
}

export async function removeSkillFromCloud(id: string) {
  const version = syncVersion
  const controller = new AbortController()
  const previous = state.skills[id]
  transferControllers.add(controller)
  setSkillState(id, { status: 'removing' })
  try {
    await removeCloudSkill(id, controller.signal)
    if (version !== syncVersion) throw new Error('移出云端已取消')
    setSkillState(id)
  } catch (err) {
    if (version === syncVersion) setSkillState(id, previous ?? { status: 'saved' })
    throw version === syncVersion
      ? err
      : new Error('移出云端已取消')
  } finally {
    transferControllers.delete(controller)
  }
}

function getRemoteCollections(tasks: CloudTask[]) {
  const collections = tasks.flatMap((item) => {
    const task = item.task as CloudTaskPayload
    return Array.isArray(task.cloudFavoriteCollections) ? task.cloudFavoriteCollections : []
  })
  return collections.filter((collection, index) =>
    collection && typeof collection.id === 'string' && collections.findIndex((item) => item.id === collection.id) === index,
  )
}

async function restoreCloudTasks(tasks: CloudTask[], version: number) {
  if (version !== syncVersion) return
  const current = useStore.getState()
  const collectionIds = new Set(current.favoriteCollections.map((collection) => collection.id))
  const remoteCollections = getRemoteCollections(tasks).filter((collection) => !collectionIds.has(collection.id))
  if (remoteCollections.length) current.setFavoriteCollections([...current.favoriteCollections, ...remoteCollections])

  const localIds = new Set(useStore.getState().tasks.map((task) => task.id))
  const restored: TaskRecord[] = []
  for (const item of tasks) {
    if (version !== syncVersion) return
    setTaskState(item.task.id, { status: 'saved' })
    if (localIds.has(item.task.id)) continue
    const { cloudFavoriteCollections: _collections, ...task } = item.task as CloudTaskPayload
    restored.push(task)
    await putTask(task)
  }
  if (version !== syncVersion) return
  if (restored.length) useStore.getState().setTasks([...restored, ...useStore.getState().tasks])
}

async function restoreCloudSkills(skills: CloudSkill[], version: number, signal: AbortSignal) {
  for (const skill of skills) {
    if (version !== syncVersion) return
    const local = getUploadedAgentSkillDoc(skill.id)
    if (!local) {
      try {
        restoreAgentSkill(skill.markdown, skill.fileName)
        setSkillState(skill.id, { status: 'saved' })
      } catch (err) {
        setSkillState(skill.id, { status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
      continue
    }
    if (local.raw === skill.markdown) {
      setSkillState(skill.id, { status: 'saved' })
      continue
    }

    const useCloud = window.confirm(
      `Skill「${agentSkills.find((item) => item.id === skill.id)?.name ?? skill.id}」的本地版本与云端版本不同。\n\n确定：使用云端版本\n取消：保留本地版本并更新云端`,
    )
    try {
      if (useCloud) restoreAgentSkill(skill.markdown, skill.fileName, true)
      else await saveCloudSkill(local.id, local.version, local.fileName, local.raw, signal)
      if (version !== syncVersion) return
      setSkillState(skill.id, { status: 'saved' })
    } catch (err) {
      if (version !== syncVersion) return
      setSkillState(skill.id, { status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }
}

async function runCloudSync(version: number, signal: AbortSignal) {
  if (version !== syncVersion) return
  emit({ ...state, syncing: true })
  try {
    const data = await loadCloudBootstrap({ signal })
    if (version !== syncVersion) {
      clearCloudAssetRegistry()
      return
    }
    emit({ ...state, account: data.account })
    await restoreCloudTasks(data.tasks, version)
    await restoreCloudSkills(data.skills, version, signal)
  } catch (err) {
    if (version === syncVersion) throw err
    clearCloudAssetRegistry()
  } finally {
    if (version === syncVersion) emit({ ...state, syncing: false })
  }
}

export function syncCloudData(): Promise<void> {
  if (!getSub2Token()) return Promise.resolve()
  const version = syncVersion
  if (syncPromise) {
    if (syncPromiseVersion === version) return syncPromise
    return syncPromise.catch(() => undefined).then(() => {
      if (version !== syncVersion || !getSub2Token()) return
      return syncCloudData()
    })
  }
  const controller = new AbortController()
  syncController = controller
  syncPromiseVersion = version
  syncPromise = runCloudSync(version, controller.signal).finally(() => {
    if (syncController === controller) syncController = null
    syncPromise = null
    syncPromiseVersion = null
  })
  return syncPromise
}

export async function refreshCloudAccount() {
  const version = syncVersion
  const account = await getCloudAccount()
  if (version === syncVersion) emit({ ...state, account })
  return account
}

function resetCloudRuntime() {
  syncVersion++
  syncController?.abort(new Error('云端同步已取消'))
  syncController = null
  transferControllers.forEach((controller) => controller.abort(new Error('云端保存已取消')))
  transferControllers.clear()
  clearCloudAssetRegistry()
  emit({ account: null, syncing: false, tasks: {}, skills: {} })
  if (useStore.getState().filterCloud) useStore.getState().setFilterCloud(false)
}

export function initCloudRuntime() {
  if (!started) {
    started = true
    const onAuthChanged = () => {
      resetCloudRuntime()
      if (getSub2Token()) {
        void syncCloudData().catch((err) => {
          console.warn('加载云端数据失败：', err)
          useStore.getState().showToast('加载云端数据失败', 'error')
        })
        return
      }
      if (useStore.getState().settings.cloudAutoSave) useStore.getState().setSettings({ cloudAutoSave: false })
    }
    window.addEventListener(SUB2_AUTH_CHANGED_EVENT, onAuthChanged)
    window.addEventListener('storage', (event) => {
      if (event.key === SUB2_AUTH_STORAGE_KEY) onAuthChanged()
    })
  }
  if (!getSub2Token()) {
    if (useStore.getState().settings.cloudAutoSave) useStore.getState().setSettings({ cloudAutoSave: false })
    return Promise.resolve()
  }
  return syncCloudData()
}
