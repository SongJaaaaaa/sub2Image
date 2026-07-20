// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_SIDEBAR_STATE,
  loadWorkspaceSidebarState,
  saveWorkspaceSidebarState,
} from './workspaceSidebarState'

describe('workspaceSidebarState', () => {
  beforeEach(() => localStorage.clear())

  it('is collapsed by default', () => {
    expect(loadWorkspaceSidebarState()).toEqual(DEFAULT_WORKSPACE_SIDEBAR_STATE)
  })

  it('restores expanded state and active category', () => {
    saveWorkspaceSidebarState({ expanded: true, activeCategory: 'tools' })
    expect(loadWorkspaceSidebarState()).toEqual({ expanded: true, activeCategory: 'tools' })
  })
})
