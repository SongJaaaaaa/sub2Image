import { useEffect, useRef, useState } from 'react'
import {
  ALL_FAVORITES_COLLECTION_ID,
  clearFailedTasks,
  getTaskFavoriteCollectionIds,
  taskMatchesFilterStatus,
  taskMatchesSearchQuery,
  useStore,
} from '../../../store'
import { openWorkspaceSidebar } from '../../../lib/workspaceSidebarState'
import {
  ChevronLeftIcon,
  CloseIcon,
  CodeIcon,
  CollectionManageIcon,
  FavoriteIcon,
  FilterIcon,
  PromptLibraryIcon,
  SearchIcon,
  TrashIcon,
} from '../../../components/ui/icons'
import PromptLibraryModal from '../../../components/PromptLibraryModal'

type Props = {
  focused: boolean
  onFocusChange: (focused: boolean) => void
}

const statusOptions = [
  { value: 'all', label: '全部任务' },
  { value: 'done', label: '已完成' },
  { value: 'running', label: '生成中' },
  { value: 'error', label: '失败' },
] as const

const iconButtonClass = 'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-sidebar text-gray-500 transition-colors hover:bg-muted hover:text-gray-900 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.07] dark:hover:text-gray-100'

export default function GalleryHeaderControls({ focused, onFocusChange }: Props) {
  const filterRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [showPromptLibrary, setShowPromptLibrary] = useState(false)
  const searchQuery = useStore((s) => s.searchQuery)
  const setSearchQuery = useStore((s) => s.setSearchQuery)
  const filterStatus = useStore((s) => s.filterStatus)
  const setFilterStatus = useStore((s) => s.setFilterStatus)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const setFilterFavorite = useStore((s) => s.setFilterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const setActiveFavoriteCollectionId = useStore((s) => s.setActiveFavoriteCollectionId)
  const openManageCollectionsModal = useStore((s) => s.openManageCollectionsModal)
  const clearSelection = useStore((s) => s.clearSelection)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const setPrompt = useStore((s) => s.setPrompt)
  const showToast = useStore((s) => s.showToast)
  const inCollectionOverview = filterFavorite && !activeFavoriteCollectionId
  const filterCount = Number(filterStatus !== 'all') + Number(filterFavorite)
  const favoriteLabel = activeFavoriteCollectionId ? '返回收藏夹' : filterFavorite ? '退出收藏夹' : '收藏夹'
  const failedCount = useStore((s) => {
    const query = s.searchQuery.trim().toLowerCase()
    return s.tasks.filter((task) => {
      if (!taskMatchesFilterStatus(task, 'error')) return false
      if (s.filterFavorite) {
        if (!task.isFavorite) return false
        if (s.activeFavoriteCollectionId && s.activeFavoriteCollectionId !== ALL_FAVORITES_COLLECTION_ID && !getTaskFavoriteCollectionIds(task).includes(s.activeFavoriteCollectionId)) return false
      }
      return taskMatchesSearchQuery(task, query)
    }).length
  })

  useEffect(() => {
    if (!filterOpen) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') setFilterOpen(false)
        return
      }
      if (filterRef.current?.contains(e.target as Node)) return
      setFilterOpen(false)
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [filterOpen])

  const handleFavoriteClick = () => {
    if (activeFavoriteCollectionId) {
      setActiveFavoriteCollectionId(null)
      return
    }
    setFilterFavorite(!filterFavorite)
  }

  const handleStatusChange = (status: typeof filterStatus) => {
    if (status === filterStatus) return
    setFilterStatus(status)
    clearSelection()
  }

  const handleClearFailed = () => {
    const state = useStore.getState()
    const query = state.searchQuery.trim().toLowerCase()
    const ids = state.tasks
      .filter((task) => {
        if (!taskMatchesFilterStatus(task, 'error')) return false
        if (state.filterFavorite) {
          if (!task.isFavorite) return false
          if (state.activeFavoriteCollectionId && state.activeFavoriteCollectionId !== ALL_FAVORITES_COLLECTION_ID && !getTaskFavoriteCollectionIds(task).includes(state.activeFavoriteCollectionId)) return false
        }
        return taskMatchesSearchQuery(task, query)
      })
      .map((task) => task.id)
    if (!ids.length) return

    setFilterOpen(false)
    setConfirmDialog({
      title: '清除失败记录',
      message: `确定清除筛选范围内的失败记录吗？\n纯失败任务会被删除；部分失败任务只会清除失败标记，保留已成功图片。共 ${ids.length} 条记录。`,
      confirmText: '清除',
      cancelText: '取消',
      tone: 'danger',
      action: () => clearFailedTasks(ids),
    })
  }

  const sideClass = `flex shrink-0 items-center gap-2 transition-all duration-300 ease-out ${focused
    ? 'max-w-0 -translate-x-2 opacity-0 pointer-events-none'
    : 'max-w-[160px] translate-x-0 opacity-100'
  }`

  return (
    <>
      <div data-gallery-header-controls className="hidden min-w-0 flex-1 items-center justify-center gap-2 xl:flex">
        <div className={sideClass}>
          <button type="button" className={iconButtonClass} aria-label="打开 Skill" title="Skill" onClick={() => openWorkspaceSidebar('skills')}>
            <CodeIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={favoriteLabel}
            title={favoriteLabel}
            onClick={handleFavoriteClick}
            className={`${iconButtonClass} ${filterFavorite ? '!border-yellow-400 !bg-yellow-50 !text-yellow-500 dark:!bg-yellow-500/10' : ''}`}
          >
            {activeFavoriteCollectionId ? <ChevronLeftIcon className="h-5 w-5" /> : <FavoriteIcon filled={filterFavorite} className="h-5 w-5" />}
          </button>
          {inCollectionOverview && (
            <button type="button" className={iconButtonClass} aria-label="管理收藏夹" title="管理收藏夹" onClick={openManageCollectionsModal}>
              <CollectionManageIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className={`relative min-w-0 transition-all duration-300 ease-out ${focused ? 'flex-1' : 'w-[clamp(280px,30vw,420px)] flex-none'}`}>
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            aria-label="搜索提示词和参数"
            placeholder={inCollectionOverview ? '搜索收藏夹名称...' : '搜索提示词、参数...'}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') inputRef.current?.blur()
            }}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-full border border-border bg-sidebar pl-12 pr-10 text-sm text-gray-900 outline-none transition-[border-color,box-shadow,background-color] duration-300 placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:shadow-[0_0_0_3px_rgba(113,128,150,0.16)] dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-100 dark:focus:border-white/[0.2] dark:focus:bg-gray-900"
          />
          {searchQuery && focused && (
            <button
              type="button"
              aria-label="清空搜索"
              title="清空搜索"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.07] dark:hover:text-gray-200"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className={sideClass}>
          <div ref={filterRef} className="relative">
            <button
              type="button"
              aria-label="筛选条件"
              aria-expanded={filterOpen}
              aria-haspopup="dialog"
              title="筛选条件"
              onClick={() => setFilterOpen((open) => !open)}
              className={`${iconButtonClass} ${filterOpen || filterCount > 0 ? '!bg-gray-200 !text-gray-900 dark:!bg-white/[0.12] dark:!text-white' : ''}`}
            >
              <FilterIcon className="h-5 w-5" />
              {filterCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-sidebar dark:ring-gray-900" />}
            </button>

            {filterOpen && (
              <div role="dialog" aria-label="筛选条件面板" className="animate-modal-in absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[420px] overflow-hidden rounded-lg border border-border bg-sidebar text-left shadow-2xl dark:border-white/[0.1] dark:bg-[#151516]">
                <div className="flex h-14 items-center gap-3 border-b border-border px-5 dark:border-white/[0.1]">
                  <FilterIcon className="h-5 w-5 text-gray-500 dark:text-gray-300" />
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">筛选条件</h2>
                </div>
                <div className="grid grid-cols-2 gap-8 p-5">
                  <section>
                    <h3 className="mb-3 text-xs font-medium text-gray-400">任务状态</h3>
                    <div className="space-y-1">
                      {statusOptions.map((option) => {
                        const active = filterStatus === option.value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => handleStatusChange(option.value)}
                            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 transition-colors hover:bg-muted dark:text-gray-200 dark:hover:bg-white/[0.06]"
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded-sm border ${active ? 'border-gray-800 bg-gray-800 dark:border-gray-100 dark:bg-gray-100' : 'border-gray-400 dark:border-gray-500'}`}>
                              {active && <span className="h-1.5 w-1.5 rounded-[1px] bg-white dark:bg-gray-900" />}
                            </span>
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 text-xs font-medium text-gray-400">收藏</h3>
                    <button
                      type="button"
                      aria-pressed={filterFavorite}
                      onClick={() => setFilterFavorite(!filterFavorite)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-700 transition-colors hover:bg-muted dark:text-gray-200 dark:hover:bg-white/[0.06]"
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded-sm border ${filterFavorite ? 'border-yellow-500 bg-yellow-500' : 'border-gray-400 dark:border-gray-500'}`}>
                        {filterFavorite && <span className="h-1.5 w-1.5 rounded-[1px] bg-white" />}
                      </span>
                      仅看收藏
                    </button>
                    {filterStatus === 'error' && (
                      <button
                        type="button"
                        disabled={failedCount === 0}
                        onClick={handleClearFailed}
                        className="mt-4 flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/[0.1] dark:text-gray-300 dark:hover:bg-white/[0.06]"
                      >
                        <TrashIcon className="h-4 w-4" />
                        清除失败记录
                      </button>
                    )}
                  </section>
                </div>
                {filterCount > 0 && (
                  <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-gray-500 dark:border-white/[0.1] dark:text-gray-400">
                    <span>已启用 {filterCount} 个条件</span>
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-gray-700 transition-colors hover:bg-muted dark:text-gray-200 dark:hover:bg-white/[0.06]"
                      onClick={() => {
                        setFilterStatus('all')
                        setFilterFavorite(false)
                        clearSelection()
                      }}
                    >
                      重置
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button type="button" className={iconButtonClass} aria-label="提示词库" title="提示词库" onClick={() => setShowPromptLibrary(true)}>
            <PromptLibraryIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <PromptLibraryModal
        open={showPromptLibrary}
        onClose={() => setShowPromptLibrary(false)}
        onUse={(item) => {
          setPrompt(item.prompt)
          setShowPromptLibrary(false)
          showToast('已填入提示词', 'success')
        }}
      />
    </>
  )
}
