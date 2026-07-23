import { describe, expect, it, vi } from 'vitest'

import { Sub2ApiAuthProvider } from './sub2ApiAuthProvider.js'

describe('Sub2ApiAuthProvider', () => {
  it('转发 token、User-Agent 和可信客户端 IP', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      data: { id: 42, email: 'user@example.com' }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })) as unknown as typeof fetch
    const auth = new Sub2ApiAuthProvider('https://api.example.com', '/auth/me', 1000, request)

    await expect(auth.verify({
      authorization: 'Bearer test-token',
      userAgent: 'test-agent',
      ip: '203.0.113.8'
    })).resolves.toEqual({ id: '42', email: 'user@example.com' })

    expect(request).toHaveBeenCalledWith('https://api.example.com/auth/me', expect.objectContaining({
      headers: {
        Authorization: 'Bearer test-token',
        'User-Agent': 'test-agent',
        'X-Forwarded-For': '203.0.113.8',
        'X-Real-IP': '203.0.113.8'
      }
    }))
  })

  it('把上游未授权和异常响应转换为固定错误', async () => {
    const unauthorized = new Sub2ApiAuthProvider(
      'https://api.example.com',
      '/auth/me',
      1000,
      vi.fn(async () => new Response(null, { status: 401 })) as unknown as typeof fetch
    )
    await expect(unauthorized.verify({ authorization: 'Bearer bad', ip: '127.0.0.1' }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })

    const invalid = new Sub2ApiAuthProvider(
      'https://api.example.com',
      '/auth/me',
      1000,
      vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 })) as unknown as typeof fetch
    )
    await expect(invalid.verify({ authorization: 'Bearer bad', ip: '127.0.0.1' }))
      .rejects.toMatchObject({ status: 502, code: 'AUTH_RESPONSE_INVALID' })

    for (const id of ['   ', Number.MAX_SAFE_INTEGER + 1]) {
      const malformed = new Sub2ApiAuthProvider(
        'https://api.example.com',
        '/auth/me',
        1000,
        vi.fn(async () => new Response(JSON.stringify({ data: { id } }), { status: 200 })) as unknown as typeof fetch
      )
      await expect(malformed.verify({ authorization: 'Bearer bad', ip: '127.0.0.1' }))
        .rejects.toMatchObject({ status: 502, code: 'AUTH_RESPONSE_INVALID' })
    }
  })
})
