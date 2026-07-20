export type WorkspaceSidebarCategory = 'skills' | 'workflows' | 'tools'

export type WorkspaceSidebarState = {
  expanded: boolean
  activeCategory: WorkspaceSidebarCategory
}

const STORAGE_KEY = 'workspace-sidebar-state'
export const OPEN_WORKSPACE_SIDEBAR_EVENT = 'workspace-sidebar:open'

export const DEFAULT_WORKSPACE_SIDEBAR_STATE: WorkspaceSidebarState = {
  expanded: false,
  activeCategory: 'skills',
}

export function loadWorkspaceSidebarState(): WorkspaceSidebarState {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return DEFAULT_WORKSPACE_SIDEBAR_STATE

  try {
    const state = JSON.parse(stored) as Partial<WorkspaceSidebarState>
    const activeCategory = state.activeCategory === 'workflows' || state.activeCategory === 'tools'
      ? state.activeCategory
      : 'skills'
    return { expanded: state.expanded === true, activeCategory }
  } catch (err) {
    console.warn('读取扩展侧边栏状态失败', err)
    return DEFAULT_WORKSPACE_SIDEBAR_STATE
  }
}

export function saveWorkspaceSidebarState(state: WorkspaceSidebarState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function openWorkspaceSidebar(activeCategory: WorkspaceSidebarCategory = 'skills') {
  window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_SIDEBAR_EVENT, { detail: activeCategory }))
}
