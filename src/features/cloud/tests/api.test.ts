import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CloudApiError,
  getCloudAccount,
  saveCloudSkill,
  uploadCloudContent,
} from '../api'

const values = new Map<string, string>()

function ok(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  values.clear()
  values.set('image2.sub2api.token', 'access-token')
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Cloud API', () => {
  it('通过同源 cloud-api 代理并携带 Sub2API token', async () => {
    const account = {
      id: 'account-1',
      provider: 'sub2api',
      externalUserId: 'user-1',
      usedBytes: 12,
      quotaBytes: 100,
      createdAt: '2026-07-23T00:00:00.000Z',
      lastSeenAt: '2026-07-23T00:00:00.000Z',
    }
    const fetcher = vi.fn().mockResolvedValue(ok(account))
    vi.stubGlobal('fetch', fetcher)

    await expect(getCloudAccount()).resolves.toEqual(account)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('/cloud-api/account')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-token')
  })

  it('按服务端契约保存 Skill', async () => {
    const skill = {
      id: 'my-skill',
      version: 2,
      fileName: 'SKILL.md',
      markdown: '# Skill',
      createdAt: '2026-07-23T00:00:00.000Z',
      updatedAt: '2026-07-23T00:00:00.000Z',
    }
    const fetcher = vi.fn().mockResolvedValue(ok(skill))
    vi.stubGlobal('fetch', fetcher)

    await expect(saveCloudSkill(skill.id, skill.version, skill.fileName, skill.markdown)).resolves.toEqual(skill)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('/cloud-api/skills/my-skill')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(JSON.stringify({ version: 2, fileName: 'SKILL.md', markdown: '# Skill' }))
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })

  it('云端鉴权过期时刷新一次 Sub2API token', async () => {
    values.set('image2.sub2api.refresh', 'refresh-token')
    const account = {
      id: 'account-1',
      provider: 'sub2api',
      externalUserId: 'user-1',
      usedBytes: 0,
      quotaBytes: 100,
      createdAt: '2026-07-23T00:00:00.000Z',
      lastSeenAt: '2026-07-23T00:00:00.000Z',
    }
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'token expired' } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: { access_token: 'new-token', expires_in: 3600 },
      }), { status: 200 }))
      .mockResolvedValueOnce(ok(account))
    vi.stubGlobal('fetch', fetcher)

    await expect(getCloudAccount()).resolves.toEqual(account)
    expect(fetcher.mock.calls[1][0]).toBe('/sub2api-auth/auth/refresh')
    expect(new Headers(fetcher.mock.calls[2][1].headers).get('Authorization')).toBe('Bearer new-token')
  })

  it('上传内容时保留二进制 body 和 MIME', async () => {
    const fetcher = vi.fn().mockResolvedValue(ok({ status: 'uploaded' }))
    vi.stubGlobal('fetch', fetcher)
    const blob = new Blob(['image'], { type: 'image/png' })

    await uploadCloudContent('upload/1', blob)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('/cloud-api/uploads/upload%2F1/content')
    expect(init.body).toBe(blob)
    expect(new Headers(init.headers).get('Content-Type')).toBe('image/png')
  })

  it('拒绝缺少 data 包装和未登录请求', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    await expect(getCloudAccount()).rejects.toMatchObject({ message: '云端响应缺少 data' })

    values.delete('image2.sub2api.token')
    await expect(getCloudAccount()).rejects.toEqual(expect.objectContaining<Partial<CloudApiError>>({
      status: 401,
      code: 'UNAUTHORIZED',
    }))
  })
})
