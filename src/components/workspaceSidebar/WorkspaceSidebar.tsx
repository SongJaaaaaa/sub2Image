import { useEffect, useState, type ReactNode } from 'react'
import {
  loadWorkspaceSidebarState,
  OPEN_WORKSPACE_SIDEBAR_EVENT,
  saveWorkspaceSidebarState,
  type WorkspaceSidebarCategory,
} from '../../lib/workspaceSidebarState'
import { CodeIcon } from '../ui/icons'
import WorkspaceSidebarNav from './WorkspaceSidebarNav'
import WorkspaceSidebarPanel from './WorkspaceSidebarPanel'

type Props = {
  appMode: 'gallery' | 'agent'
  children: ReactNode
}

export default function WorkspaceSidebar({ appMode, children }: Props) {
  const [state, setState] = useState(loadWorkspaceSidebarState)

  useEffect(() => {
    saveWorkspaceSidebarState(state)
  }, [state])

  useEffect(() => {
    const open = (e: Event) => {
      const activeCategory = (e as CustomEvent<WorkspaceSidebarCategory>).detail || 'skills'
      setState({ activeCategory, expanded: true })
    }
    window.addEventListener(OPEN_WORKSPACE_SIDEBAR_EVENT, open)
    return () => window.removeEventListener(OPEN_WORKSPACE_SIDEBAR_EVENT, open)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.workspaceSidebarExpanded = String(state.expanded)
    return () => {
      delete document.documentElement.dataset.workspaceSidebarExpanded
    }
  }, [state.expanded])

  useEffect(() => {
    if (!state.expanded) return
    const close = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setState((current) => ({ ...current, expanded: false }))
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [state.expanded])

  const selectCategory = (activeCategory: WorkspaceSidebarCategory) => {
    setState({ activeCategory, expanded: true })
  }

  const close = () => setState((current) => ({ ...current, expanded: false }))

  return (
    <>
      <button
        type="button"
        aria-label="打开扩展侧边栏"
        title="扩展"
        onClick={() => setState((current) => ({ ...current, expanded: true }))}
        className={`fixed left-2 z-30 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-sidebar/95 text-gray-600 shadow-md backdrop-blur transition-colors hover:bg-white hover:text-gray-900 dark:border-white/[0.1] dark:bg-gray-950/95 dark:text-gray-300 dark:hover:bg-gray-800 lg:hidden ${appMode === 'agent'
          ? 'top-14'
          : 'top-[calc(var(--app-header-height,4rem)+0.75rem)]'
        }`}
      >
        <CodeIcon className="h-5 w-5" />
      </button>

      {state.expanded && (
        <button
          type="button"
          aria-label="关闭扩展侧边栏"
          onClick={close}
          className="fixed inset-y-0 right-0 left-[min(88vw,344px)] z-40 bg-black/45 lg:hidden"
        />
      )}

      <aside
        className={`fixed bottom-0 left-0 top-[var(--app-header-height,4rem)] z-40 flex w-[min(88vw,344px)] border-r border-border bg-sidebar/95 shadow-2xl backdrop-blur transition-transform duration-200 dark:border-white/[0.08] dark:bg-gray-950/95 lg:hidden ${state.expanded ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <WorkspaceSidebarNav activeCategory={state.activeCategory} onSelect={selectCategory} />
        <WorkspaceSidebarPanel activeCategory={state.activeCategory} onClose={close} />
      </aside>

      <aside className={`fixed bottom-0 left-0 top-[var(--app-header-height,4rem)] z-30 hidden border-r border-border bg-sidebar/90 backdrop-blur dark:border-white/[0.08] dark:bg-gray-950/90 lg:flex ${state.expanded ? '' : 'xl:hidden'}`}>
        <WorkspaceSidebarNav activeCategory={state.activeCategory} onSelect={selectCategory} />
        {state.expanded && (
          <div className="flex w-[280px]">
            <WorkspaceSidebarPanel activeCategory={state.activeCategory} onClose={close} />
          </div>
        )}
      </aside>

      <div className={`transition-[padding] duration-200 ${state.expanded ? 'lg:pl-[344px]' : 'lg:pl-16 xl:pl-0'}`}>
        {children}
      </div>
    </>
  )
}
