import { VideoApiError } from './errors'

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback
  const error = (payload as { error?: unknown }).error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  if (typeof (payload as { message?: unknown }).message === 'string') return (payload as { message: string }).message
  return fallback
}

export async function requestVideoJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const text = await response.text()
  const payload = text ? (() => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return null
    }
  })() : null

  if (!response.ok) {
    throw new VideoApiError(getErrorMessage(payload, `视频请求失败：${response.status}`), {
      status: response.status,
      rawResponsePayload: text || undefined,
    })
  }
  if (!payload) throw new VideoApiError('视频接口返回了无效的 JSON', { rawResponsePayload: text || undefined })
  return payload as T
}
