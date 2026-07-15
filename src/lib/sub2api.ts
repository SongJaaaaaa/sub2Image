import type { Sub2Config } from '../types'
import { readRuntimeEnv } from './runtimeEnv'

const authBase = '/sub2api-auth'
const bridgeBase = '/sub2-bridge'
const tokenKey = 'image2.sub2api.token'
const refreshKey = 'image2.sub2api.refresh'
const expiresKey = 'image2.sub2api.expires'
const userKey = 'image2.sub2api.user'

export const OPEN_SUB2_CONNECT_EVENT = 'sub2-connect'
export const SUB2_IMAGE_MODEL = readRuntimeEnv(import.meta.env.VITE_JWS_IMAGE_MODEL) || 'gpt-image-2'

export interface Sub2User {
  id?: number
  email?: string
  username?: string
  display_name?: string
}

export interface Sub2Key {
  id: number
  key: string
  name: string
  status: string
  group_id: number | null
  group?: {
    id?: number
    name?: string
    platform?: string
  }
}

export interface Sub2Model {
  id: string
  display_name?: string
  owned_by?: string
}

export interface Sub2KeyModels {
  key: {
    id: number
    name: string
    group_id: number
    group_name: string
    platform: string
  }
  accounts: Array<{
    id: number
    name: string
    platform: string
  }>
  models: Sub2Model[]
}

export interface Sub2PublicSettings {
  turnstile_enabled?: boolean
  turnstile_site_key?: string
}

interface AuthResult {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user?: Sub2User
  requires_2fa?: boolean
  temp_token?: string
  user_email_masked?: string
}

export type Sub2LoginResult =
  | { requires2fa: true; tempToken: string; maskedEmail: string }
  | { requires2fa: false; user: Sub2User }

function saveAuth(data: AuthResult) {
  if (!data.access_token) throw new Error('登录响应中没有 access_token')
  localStorage.setItem(tokenKey, data.access_token)
  if (data.refresh_token) localStorage.setItem(refreshKey, data.refresh_token)
  if (data.expires_in) localStorage.setItem(expiresKey, String(Date.now() + data.expires_in * 1000))
}

function saveUser(data: AuthResult, email: string) {
  saveAuth(data)
  const user = data.user || { email }
  localStorage.setItem(userKey, JSON.stringify(user))
  return user
}

async function readJson(res: Response) {
  const text = await res.text()
  let json: any
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    console.error('[Sub2API] 响应不是 JSON', {
      url: res.url,
      status: res.status,
      contentType: res.headers.get('content-type'),
      body: text.slice(0, 300),
    })
    throw new Error(`Sub2API 响应异常 (${res.status})`)
  }

  if (!res.ok || (json && typeof json.code !== 'undefined' && json.code !== 0)) {
    throw new Error(json?.message || json?.error?.message || `请求失败 (${res.status})`)
  }

  return json && json.code === 0 ? json.data : json
}

async function refreshSub2Token() {
  const refreshToken = localStorage.getItem(refreshKey) || ''
  if (!refreshToken) throw new Error('登录已过期，请重新登录 Sub2API')
  const res = await fetch(`${authBase}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  const data = await readJson(res) as AuthResult
  saveAuth(data)
  return data.access_token || ''
}

async function authFetch(path: string, init: RequestInit = {}, retry = true) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getSub2Token()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${authBase}/${path.replace(/^\/+/, '')}`, { ...init, headers })
  if (res.status === 401 && retry && localStorage.getItem(refreshKey)) {
    await refreshSub2Token()
    return authFetch(path, init, false)
  }
  return readJson(res)
}

async function bridgeFetch(path: string, retry = true) {
  const res = await fetch(`${bridgeBase}/${path.replace(/^\/+/, '')}`, {
    headers: { Authorization: `Bearer ${getSub2Token()}` },
  })
  if (res.status === 401 && retry && localStorage.getItem(refreshKey)) {
    await refreshSub2Token()
    return bridgeFetch(path, false)
  }
  return readJson(res)
}

export function getSub2Token() {
  return localStorage.getItem(tokenKey) || ''
}

export function getSub2User(): Sub2User | null {
  try {
    return JSON.parse(localStorage.getItem(userKey) || 'null')
  } catch {
    return null
  }
}

export function getSub2PublicSettings() {
  return authFetch('settings/public', {}, false) as Promise<Sub2PublicSettings>
}

export async function loginSub2(email: string, password: string, turnstileToken = ''): Promise<Sub2LoginResult> {
  const data = await authFetch('auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
    }),
  }, false) as AuthResult
  if (data.requires_2fa) {
    if (!data.temp_token) throw new Error('两步验证响应中没有 temp_token')
    return {
      requires2fa: true,
      tempToken: data.temp_token,
      maskedEmail: data.user_email_masked || '',
    }
  }
  return { requires2fa: false, user: saveUser(data, email) }
}

export async function loginSub2TwoFactor(tempToken: string, code: string, email: string) {
  const data = await authFetch('auth/login/2fa', {
    method: 'POST',
    body: JSON.stringify({ temp_token: tempToken, totp_code: code }),
  }, false) as AuthResult
  return saveUser(data, email)
}

export function logoutSub2() {
  localStorage.removeItem(tokenKey)
  localStorage.removeItem(refreshKey)
  localStorage.removeItem(expiresKey)
  localStorage.removeItem(userKey)
}

export async function listSub2Keys() {
  const data = await authFetch('keys?page=1&page_size=100')
  const items = Array.isArray(data) ? data : data?.items
  return (Array.isArray(items) ? items : []) as Sub2Key[]
}

export async function listSub2KeyModels(keyId: number) {
  return bridgeFetch(`keys/${keyId}/models`) as Promise<Sub2KeyModels>
}

export function newSub2Config(kind: Sub2Config['kind']): Sub2Config {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return {
    id,
    name: kind === 'image' ? '生图配置' : '文本配置',
    kind,
    keyId: 0,
    keyName: '',
    groupId: 0,
    groupName: '',
    platform: '',
    model: '',
    profileId: `sub2api-${kind}-${id}`,
  }
}
