import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RemotePrompt } from '../types'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import {
  filterPromptLibrary,
  getPromptCacheState,
  getPromptSource,
  PROMPT_SOURCES,
  refreshPromptLibrary,
} from '../lib/promptLibrary'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, RefreshIcon } from './icons'

const PAGE_SIZE = 24

type PromptLibraryModalProps = {
  open: boolean
  onClose: () => void
  onUse: (prompt: RemotePrompt) => void
}

export default function PromptLibraryModal({ open, onClose, onUse }: PromptLibraryModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<RemotePrompt[]>([])
  const [query, setQuery] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [tag, setTag] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<RemotePrompt | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [failedSources, setFailedSources] = useState<string[]>([])

  useCloseOnEscape(open, selected ? () => setSelected(null) : onClose)
  usePreventBackgroundScroll(open, scrollRef)

  const refresh = async () => {
    setRefreshing(true)
    try {
      const result = await refreshPromptLibrary()
      setItems(result.items)
      setFailedSources(result.failedSources)
      return result
    } catch (err) {
      console.warn('刷新提示词库失败', err)
      return null
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!open) return

    let active = true
    setSelected(null)
    setFailedSources([])
    setLoading(true)
    setRefreshing(false)

    void getPromptCacheState()
      .then(async (cache) => {
        if (!active) return
        setItems(cache.items)
        setLoading(false)
        if (!cache.needsRefresh && cache.items.length) return

        setRefreshing(true)
        const result = await refreshPromptLibrary()
        if (!active) return
        setItems(result.items)
        setFailedSources(result.failedSources)
        setRefreshing(false)
      })
      .catch((err) => {
        console.warn('读取提示词缓存失败', err)
        if (!active) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      active = false
    }
  }, [open])

  const tags = useMemo(() => {
    const sourceItems = sourceId ? items.filter((item) => item.source === sourceId) : items
    return Array.from(new Set(sourceItems.flatMap((item) => item.tags))).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [items, sourceId])

  useEffect(() => {
    if (tag && !tags.includes(tag)) setTag('')
  }, [tag, tags])

  const filtered = useMemo(
    () => filterPromptLibrary(items, query, sourceId, tag),
    [items, query, sourceId, tag],
  )
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const currentPage = Math.min(page, Math.max(pageCount, 1))
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => {
    if (!pageCount || page <= pageCount) return
    setPage(pageCount)
    listRef.current?.scrollTo({ top: 0 })
  }, [page, pageCount])

  if (!open) return null

  const failedLabels = failedSources
    .map((id) => getPromptSource(id)?.label || id)
    .join('、')

  return createPortal(
    <div data-no-drag-select className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-in" />
      <div
        ref={scrollRef}
        className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-gray-50 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-950 dark:ring-white/10 sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2rem]"
        onClick={(event) => event.stopPropagation()}
      >
        {selected ? (
          <PromptDetail prompt={selected} onBack={() => setSelected(null)} onClose={onClose} onUse={onUse} />
        ) : (
          <>
            <div className="shrink-0 border-b border-gray-200/80 bg-white/90 px-4 py-4 backdrop-blur dark:border-white/[0.08] dark:bg-gray-900/90 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">提示词库</h2>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">共 {items.length} 条提示词，数据来自 GitHub 开源项目</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={refreshing}
                    className="rounded-xl p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
                    aria-label="刷新提示词库"
                    title="刷新提示词库"
                  >
                    <RefreshIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
                    aria-label="关闭"
                  >
                    <CloseIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_240px]">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setPage(1)
                      listRef.current?.scrollTo({ top: 0 })
                    }}
                    placeholder="搜索标题、提示词、标签..."
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
                <select
                  value={sourceId}
                  onChange={(event) => {
                    setSourceId(event.target.value)
                    setPage(1)
                    listRef.current?.scrollTo({ top: 0 })
                  }}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200"
                >
                  <option value="">全部来源</option>
                  {PROMPT_SOURCES.map((source) => (
                    <option key={source.id} value={source.id}>{source.label}</option>
                  ))}
                </select>
              </div>

              {tags.length > 0 && (
                <div className="mt-3 flex max-h-[72px] flex-wrap gap-1.5 overflow-y-auto custom-scrollbar">
                  <button
                    type="button"
                    onClick={() => {
                      setTag('')
                      setPage(1)
                      listRef.current?.scrollTo({ top: 0 })
                    }}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${!tag ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.1]'}`}
                  >
                    全部标签
                  </button>
                  {tags.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setTag(item === tag ? '' : item)
                        setPage(1)
                        listRef.current?.scrollTo({ top: 0 })
                      }}
                      className={`rounded-full px-3 py-1 text-xs transition-colors ${item === tag ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.1]'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}

              {failedLabels && (
                <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  以下来源更新失败，已尽量使用本地缓存：{failedLabels}
                </div>
              )}
            </div>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
              {loading && !items.length ? (
                <div className="flex h-56 items-center justify-center text-sm text-gray-400">正在读取提示词...</div>
              ) : filtered.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {pageItems.map((item) => (
                    <PromptCard key={item.id} prompt={item} onClick={() => setSelected(item)} />
                  ))}
                </div>
              ) : (
                <div className="flex h-56 flex-col items-center justify-center text-center">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{items.length ? '没有匹配的提示词' : '提示词加载失败'}</div>
                  <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">{items.length ? '尝试更换关键词或筛选条件' : '请检查网络后点击右上角刷新'}</div>
                </div>
              )}
            </div>
            {pageCount > 1 && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200/80 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/[0.08] dark:bg-gray-900/90 sm:px-6">
                <span className="text-xs text-gray-400 dark:text-gray-500">共 {filtered.length} 条</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPage(currentPage - 1)
                      listRef.current?.scrollTo({ top: 0 })
                    }}
                    disabled={currentPage === 1}
                    className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-400 dark:hover:border-blue-500/40 dark:hover:text-blue-400"
                    aria-label="上一页"
                    title="上一页"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <select
                    value={currentPage}
                    onChange={(event) => {
                      setPage(Number(event.target.value))
                      listRef.current?.scrollTo({ top: 0 })
                    }}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300"
                    aria-label="选择页码"
                  >
                    {Array.from({ length: pageCount }, (_, idx) => (
                      <option key={idx + 1} value={idx + 1}>第 {idx + 1} 页</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setPage(currentPage + 1)
                      listRef.current?.scrollTo({ top: 0 })
                    }}
                    disabled={currentPage === pageCount}
                    className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-400 dark:hover:border-blue-500/40 dark:hover:text-blue-400"
                    aria-label="下一页"
                    title="下一页"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function PromptCard({ prompt, onClick }: { prompt: RemotePrompt; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-xl border border-gray-200/80 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-white/[0.08] dark:bg-gray-900 dark:hover:border-blue-500/40"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/40 dark:to-purple-950/40">
        {prompt.coverUrl ? (
          <img
            src={prompt.coverUrl}
            alt={prompt.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            onError={(event) => { event.currentTarget.style.display = 'none' }}
          />
        ) : null}
        <div className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
          {prompt.model}
        </div>
      </div>
      <div className="p-2.5">
        <h3 className="line-clamp-1 text-xs font-semibold text-gray-900 dark:text-gray-100">{prompt.title}</h3>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-gray-500 dark:text-gray-400">{prompt.prompt}</p>
      </div>
    </button>
  )
}

function PromptDetail({
  prompt,
  onBack,
  onClose,
  onUse,
}: {
  prompt: RemotePrompt
  onBack: () => void
  onClose: () => void
  onUse: (prompt: RemotePrompt) => void
}) {
  const source = getPromptSource(prompt.source)
  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200/80 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/[0.08] dark:bg-gray-900/90 sm:px-6">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 rounded-xl px-2 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/[0.08] dark:hover:text-gray-200">
          <ChevronLeftIcon className="h-4 w-4" />
          返回提示词库
        </button>
        <button type="button" onClick={onClose} className="rounded-xl p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-gray-200" aria-label="关闭">
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar sm:p-6">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[minmax(260px,380px)_minmax(0,1fr)]">
          <div>
            <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/40 dark:to-purple-950/40">
              {prompt.coverUrl ? (
                <img src={prompt.coverUrl} alt={prompt.title} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none' }} />
              ) : null}
            </div>
            <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 text-xs leading-6 text-gray-500 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-400">
              <div><span className="text-gray-400">来源：</span>{source?.label || prompt.source}</div>
              <div><span className="text-gray-400">模型：</span>{prompt.model}</div>
              <div><span className="text-gray-400">许可证：</span>{prompt.license}</div>
              <a href={prompt.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-blue-500 hover:text-blue-600 hover:underline">查看原始 GitHub 项目</a>
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">{prompt.title}</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {prompt.tags.map((item) => (
                <span key={item} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">{item}</span>
              ))}
            </div>
            <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-gray-200 bg-white p-4 text-sm leading-7 text-gray-700 shadow-sm dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 sm:p-5">
              {prompt.prompt}
            </div>
            <button
              type="button"
              onClick={() => onUse(prompt)}
              className="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800 sm:w-auto sm:min-w-36"
            >
              使用提示词
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
