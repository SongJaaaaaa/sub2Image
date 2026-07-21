export type ExtensionSection = 'tools' | 'skills'

export type ExtensionRoute =
  | { type: 'list'; section: ExtensionSection }
  | { type: 'item'; section: ExtensionSection; itemId: string }
  | { type: 'not-found' }

export const EXTENSION_ROOT_PATH = '/app/extensions'

export function isExtensionPath(pathname: string) {
  return pathname === EXTENSION_ROOT_PATH || pathname.startsWith(`${EXTENSION_ROOT_PATH}/`)
}

export function parseExtensionRoute(pathname: string): ExtensionRoute | null {
  if (!isExtensionPath(pathname)) return null
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length === 2) return { type: 'list', section: 'tools' }
  if (parts.length < 3 || (parts[2] !== 'tools' && parts[2] !== 'skills')) return { type: 'not-found' }
  if (parts.length === 3) return { type: 'list', section: parts[2] }
  if (parts.length !== 4) return { type: 'not-found' }

  try {
    const itemId = decodeURIComponent(parts[3])
    if (!itemId || itemId.includes('/')) return { type: 'not-found' }
    return { type: 'item', section: parts[2], itemId }
  } catch {
    return { type: 'not-found' }
  }
}

export function getExtensionPath(section?: ExtensionSection, itemId?: string) {
  if (!section) return EXTENSION_ROOT_PATH
  return itemId
    ? `${EXTENSION_ROOT_PATH}/${section}/${encodeURIComponent(itemId)}`
    : `${EXTENSION_ROOT_PATH}/${section}`
}

function navigate(path: string) {
  if (`${window.location.pathname}${window.location.search}` === path) return
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigateToExtensionWorkspace(section?: ExtensionSection, itemId?: string, params?: Record<string, string>) {
  const search = params ? new URLSearchParams(params).toString() : ''
  navigate(`${getExtensionPath(section, itemId)}${search ? `?${search}` : ''}`)
}

export function leaveExtensionWorkspace() {
  navigate('/app')
}
