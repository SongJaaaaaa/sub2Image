import { AppError } from '../../errors.js'
import type { AuthProvider, AuthRequest } from './authProvider.js'

type AuthResponse = {
  data?: {
    id?: string | number
    email?: string
  }
}

export class Sub2ApiAuthProvider implements AuthProvider {
  constructor(
    private baseUrl: string,
    private path: string,
    private timeout: number,
    private request: typeof fetch = fetch
  ) {}

  async verify(req: AuthRequest) {
    if (!req.authorization?.startsWith('Bearer ') || req.authorization.length <= 7) {
      throw new AppError(401, 'UNAUTHORIZED', '请先登录')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)
    try {
      const headers: Record<string, string> = {
        Authorization: req.authorization,
        'X-Forwarded-For': req.ip,
        'X-Real-IP': req.ip
      }
      if (req.userAgent) headers['User-Agent'] = req.userAgent

      const res = await this.request(`${this.baseUrl}${this.path}`, {
        headers,
        signal: controller.signal
      })
      if (res.status === 401 || res.status === 403) {
        throw new AppError(401, 'UNAUTHORIZED', '登录已失效')
      }
      if (!res.ok) throw new AppError(502, 'AUTH_UPSTREAM_ERROR', '身份服务暂时不可用')

      const body = await res.json() as AuthResponse
      const id = body.data?.id
      const validString = typeof id === 'string' && Boolean(id.trim())
      const validNumber = typeof id === 'number' && Number.isSafeInteger(id)
      if (!validString && !validNumber) {
        throw new AppError(502, 'AUTH_RESPONSE_INVALID', '身份服务返回异常')
      }

      return {
        id: typeof id === 'string' ? id.trim() : String(id),
        ...(typeof body.data?.email === 'string' ? { email: body.data.email } : {})
      }
    } catch (err) {
      if (err instanceof AppError) throw err
      if ((err as Error).name === 'AbortError') {
        throw new AppError(504, 'AUTH_TIMEOUT', '身份校验超时')
      }
      throw new AppError(502, 'AUTH_UPSTREAM_ERROR', '身份服务暂时不可用')
    } finally {
      clearTimeout(timer)
    }
  }
}
