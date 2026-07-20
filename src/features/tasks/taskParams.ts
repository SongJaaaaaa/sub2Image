import type { TaskParams } from '../../types'

export function hasActualParams(params: Partial<TaskParams> | undefined): params is Partial<TaskParams> {
  return Boolean(params && Object.keys(params).length > 0)
}

export function firstActualParams(paramsList: Array<Partial<TaskParams> | undefined> | undefined): Partial<TaskParams> | undefined {
  return paramsList?.find(hasActualParams)
}

export function mapActualParamsByImage(outputIds: string[], paramsList: Array<Partial<TaskParams> | undefined> | undefined) {
  const mapped = paramsList?.reduce<Record<string, Partial<TaskParams>>>((acc, params, idx) => {
    const id = outputIds[idx]
    if (id && hasActualParams(params)) acc[id] = params
    return acc
  }, {})
  return mapped && Object.keys(mapped).length > 0 ? mapped : undefined
}

export function getImageSizeParam(size: { width?: number; height?: number } | undefined): Partial<TaskParams> | undefined {
  if (!size?.width || !size.height) return undefined
  return { size: `${size.width}x${size.height}` }
}

export function hasActualSizeParam(params: Partial<TaskParams> | undefined) {
  return Boolean(params?.size)
}

function addImageSizeParam(
  params: Partial<TaskParams> | undefined,
  size: { width?: number; height?: number } | undefined,
): Partial<TaskParams> | undefined {
  if (hasActualSizeParam(params)) return params
  const sizeParam = getImageSizeParam(size)
  if (!sizeParam) return params
  return { ...(params ?? {}), ...sizeParam }
}

async function readImageSizeParam(dataUrl: string): Promise<Partial<TaskParams> | undefined> {
  if (typeof Image === 'undefined') return undefined

  return new Promise((resolve) => {
    let settled = false
    const img = new Image()
    const finish = (params: Partial<TaskParams> | undefined) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(params)
    }
    const timer = setTimeout(() => finish(undefined), 2000)
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        finish({ size: `${img.naturalWidth}x${img.naturalHeight}` })
      } else {
        finish(undefined)
      }
    }
    img.onerror = () => finish(undefined)
    img.src = dataUrl
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      finish({ size: `${img.naturalWidth}x${img.naturalHeight}` })
    }
  })
}

export async function resolveImageSizeParamsList(
  images: string[],
  preferred?: Array<Partial<TaskParams> | undefined>,
  sizes?: Array<{ width?: number; height?: number } | undefined>,
): Promise<Array<Partial<TaskParams> | undefined>> {
  const stored = images.map((_, idx) => addImageSizeParam(preferred?.[idx], sizes?.[idx]))
  if (stored.every(hasActualSizeParam)) return stored

  const fallback = await Promise.all(images.map((img) => readImageSizeParam(img)))
  return images.map((_, idx) => {
    const params = stored[idx]
    const fallbackParams = fallback[idx]
    if (hasActualSizeParam(params)) return params
    if (fallbackParams?.size) return { ...(params ?? {}), size: fallbackParams.size }
    return hasActualParams(params) ? params : fallbackParams
  })
}
