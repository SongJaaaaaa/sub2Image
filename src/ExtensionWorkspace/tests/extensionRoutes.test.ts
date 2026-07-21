// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  EXTENSION_ROOT_PATH,
  getExtensionPath,
  isExtensionPath,
  leaveExtensionWorkspace,
  navigateToExtensionWorkspace,
  parseExtensionRoute,
} from '../extensionRoutes'

describe('extensionRoutes', () => {
  beforeEach(() => window.history.replaceState(null, '', '/app'))

  it('parses list, item and invalid extension paths', () => {
    expect(parseExtensionRoute('/app/extensions')).toEqual({ type: 'list', section: 'tools' })
    expect(parseExtensionRoute('/app/extensions/tools/')).toEqual({ type: 'list', section: 'tools' })
    expect(parseExtensionRoute('/app/extensions/skills/product-photo')).toEqual({ type: 'item', section: 'skills', itemId: 'product-photo' })
    expect(parseExtensionRoute('/app/extensions/workflows')).toEqual({ type: 'not-found' })
    expect(parseExtensionRoute('/app/extensions/tools/a/b')).toEqual({ type: 'not-found' })
    expect(parseExtensionRoute('/app')).toBeNull()
  })

  it('builds encoded extension paths', () => {
    expect(EXTENSION_ROOT_PATH).toBe('/app/extensions')
    expect(getExtensionPath()).toBe('/app/extensions')
    expect(getExtensionPath('tools')).toBe('/app/extensions/tools')
    expect(getExtensionPath('skills', '产品 图')).toBe('/app/extensions/skills/%E4%BA%A7%E5%93%81%20%E5%9B%BE')
    expect(isExtensionPath('/app/extensions/tools')).toBe(true)
    expect(isExtensionPath('/app/extension')).toBe(false)
  })

  it('navigates through browser history', () => {
    navigateToExtensionWorkspace('skills')
    expect(window.location.pathname).toBe('/app/extensions/skills')
    leaveExtensionWorkspace()
    expect(window.location.pathname).toBe('/app')
  })

  it('passes tool input through the query string', () => {
    navigateToExtensionWorkspace('tools', 'image-editor', { image: 'image 1' })

    expect(window.location.pathname).toBe('/app/extensions/tools/image-editor')
    expect(window.location.search).toBe('?image=image+1')

    navigateToExtensionWorkspace('tools', 'image-editor')
    expect(window.location.search).toBe('')
  })
})
