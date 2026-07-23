import { getSub2Token, refreshSub2Token } from '../../lib/sub2api'
import type {
  CloudAccount,
  CloudAsset,
  CloudBootstrap,
  CloudSkill,
  CloudTask,
  CloudTaskAssetRef,
  CloudUpload,
  CloudUploadInput,
} from './types'

const CLOUD_BASE = '/cloud-api'

type JsonRecord = Record<string, unknown>

export class CloudApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'CloudApiError'
    this.status = status
    this.code = code
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isCloudAccount(value: unknown): value is CloudAccount {
  if (!isRecord(value)) return false
  return isString(value.id)
    && isString(value.provider)
    && isString(value.externalUserId)
    && typeof value.usedBytes === 'number'
    && typeof value.quotaBytes === 'number'
    && isString(value.createdAt)
    && isString(value.lastSeenAt)
}

function isCloudAsset(value: unknown): value is CloudAsset {
  if (!isRecord(value)) return false
  return isString(value.id)
    && isString(value.assetId)
    && (value.kind === 'image' || value.kind === 'video')
    && isString(value.mimeType)
    && typeof value.size === 'number'
    && isString(value.sha256)
    && isRecord(value.metadata)
    && isString(value.contentUrl)
    && isString(value.createdAt)
}

function isCloudTask(value: unknown): value is CloudTask {
  if (!isRecord(value) || !isString(value.id) || !isRecord(value.task) || !isString(value.task.id)) return false
  if (!Array.isArray(value.assets) || !value.assets.every((asset) => {
    if (!isCloudAsset(asset) || !isRecord(asset)) return false
    return ['input', 'output', 'mask', 'original', 'video', 'poster', 'thumbnail'].includes(String(asset.role))
      && Number.isInteger(asset.index)
  })) return false
  return isString(value.createdAt) && isString(value.updatedAt)
}

function isCloudSkill(value: unknown): value is CloudSkill {
  if (!isRecord(value)) return false
  return isString(value.id)
    && Number.isInteger(value.version)
    && Number(value.version) > 0
    && isString(value.fileName)
    && typeof value.markdown === 'string'
    && isString(value.createdAt)
    && isString(value.updatedAt)
}

function isCloudUpload(value: unknown): value is CloudUpload {
  if (!isRecord(value)) return false
  if (!isString(value.id) || !isString(value.assetId) || typeof value.uploadRequired !== 'boolean') return false
  if (!['pending', 'uploaded', 'complete'].includes(String(value.status))) return false
  return value.asset === undefined || isCloudAsset(value.asset)
}

function getErrorMessage(value: unknown, status: number) {
  if (!isRecord(value)) return `云端请求失败 (${status})`
  if (typeof value.message === 'string' && value.message) return value.message
  if (typeof value.error === 'string' && value.error) return value.error
  if (isRecord(value.error) && typeof value.error.message === 'string') return value.error.message
  return `云端请求失败 (${status})`
}

function getErrorCode(value: unknown) {
  if (!isRecord(value)) return undefined
  if (typeof value.code === 'string') return value.code
  if (isRecord(value.error) && typeof value.error.code === 'string') return value.error.code
  return undefined
}

function authHeaders(headers?: HeadersInit) {
  const token = getSub2Token()
  if (!token) throw new CloudApiError('请先登录 Sub2API', 401, 'UNAUTHORIZED')
  const next = new Headers(headers)
  next.set('Authorization', `Bearer ${token}`)
  return next
}

function throwIfAborted(signal?: AbortSignal | null) {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new CloudApiError('云端请求已取消', 499, 'CANCELLED')
}

async function cloudFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  throwIfAborted(init.signal)
  const res = await fetch(`${CLOUD_BASE}${path}`, {
    ...init,
    headers: authHeaders(init.headers),
  })
  if (res.status !== 401 || !retry) return res
  throwIfAborted(init.signal)
  await refreshSub2Token(init.signal ?? undefined)
  throwIfAborted(init.signal)
  return cloudFetch(path, init, false)
}

async function readJson(res: Response) {
  const text = await res.text()
  let json: unknown
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    console.error('[Cloud] 响应不是 JSON', {
      url: res.url,
      status: res.status,
      contentType: res.headers.get('content-type'),
      body: text.slice(0, 300),
    })
    throw new CloudApiError(`云端响应异常 (${res.status})`, res.status)
  }

  if (!res.ok) throw new CloudApiError(getErrorMessage(json, res.status), res.status, getErrorCode(json))
  if (!isRecord(json) || !Object.prototype.hasOwnProperty.call(json, 'data')) {
    throw new CloudApiError('云端响应缺少 data', res.status)
  }
  return json.data
}

async function requestJson(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  return readJson(await cloudFetch(path, { ...init, headers }))
}

function expectValue<T>(value: unknown, check: (value: unknown) => value is T, name: string) {
  if (!check(value)) throw new CloudApiError(`云端返回的${name}格式无效`, 200)
  return value
}

function expectList<T>(value: unknown, check: (value: unknown) => value is T, name: string) {
  if (!Array.isArray(value) || !value.every(check)) {
    throw new CloudApiError(`云端返回的${name}格式无效`, 200)
  }
  return value
}

export async function getCloudAccount() {
  return expectValue(await requestJson('/account'), isCloudAccount, '账号')
}

export async function listCloudTasks(signal?: AbortSignal) {
  return expectList(await requestJson('/tasks', { signal }), isCloudTask, '任务列表')
}

export async function saveCloudTask(task: CloudTask['task'], assets: CloudTaskAssetRef[], signal?: AbortSignal) {
  return expectValue(await requestJson(`/tasks/${encodeURIComponent(task.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ task, assets }),
    signal,
  }), isCloudTask, '任务')
}

export async function removeCloudTask(id: string, signal?: AbortSignal) {
  const data = await requestJson(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE', signal })
  if (!isRecord(data) || data.deleted !== true) throw new CloudApiError('云端返回的删除结果格式无效', 200)
}

export async function createCloudUpload(input: CloudUploadInput, signal?: AbortSignal) {
  return expectValue(await requestJson('/uploads', {
    method: 'POST',
    body: JSON.stringify(input),
    signal,
  }), isCloudUpload, '上传记录')
}

export async function uploadCloudContent(id: string, content: Blob, signal?: AbortSignal) {
  const data = await requestJson(`/uploads/${encodeURIComponent(id)}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': content.type || 'application/octet-stream' },
    body: content,
    signal,
  })
  if (data !== null && !isRecord(data)) throw new CloudApiError('云端返回的上传结果格式无效', 200)
}

export async function completeCloudUpload(id: string, signal?: AbortSignal) {
  return expectValue(await requestJson(`/uploads/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    signal,
  }), isCloudAsset, '资源')
}

export async function downloadCloudAsset(id: string, signal?: AbortSignal) {
  const res = await cloudFetch(`/assets/${encodeURIComponent(id)}/content`, { signal })
  if (!res.ok) {
    let json: unknown
    try {
      json = JSON.parse(await res.text())
    } catch {
      json = null
    }
    throw new CloudApiError(getErrorMessage(json, res.status), res.status, getErrorCode(json))
  }
  return res.blob()
}

export async function listCloudSkills() {
  return expectList(await requestJson('/skills'), isCloudSkill, 'Skill 列表')
}

export async function saveCloudSkill(id: string, version: number, fileName: string, markdown: string, signal?: AbortSignal) {
  return expectValue(await requestJson(`/skills/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ version, fileName, markdown }),
    signal,
  }), isCloudSkill, 'Skill')
}

export async function removeCloudSkill(id: string, signal?: AbortSignal) {
  const data = await requestJson(`/skills/${encodeURIComponent(id)}`, { method: 'DELETE', signal })
  if (!isRecord(data) || data.deleted !== true) throw new CloudApiError('云端返回的删除结果格式无效', 200)
}

export async function getCloudBootstrap(signal?: AbortSignal) {
  const data = await requestJson('/sync/bootstrap', { signal })
  if (!isRecord(data)) throw new CloudApiError('云端返回的同步数据格式无效', 200)
  return {
    account: expectValue(data.account, isCloudAccount, '账号'),
    tasks: expectList(data.tasks, isCloudTask, '任务列表'),
    skills: expectList(data.skills, isCloudSkill, 'Skill 列表'),
  } satisfies CloudBootstrap
}
