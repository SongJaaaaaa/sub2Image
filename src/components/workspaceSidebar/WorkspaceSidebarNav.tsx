import { useRef, type KeyboardEvent } from 'react'
import { CodeIcon, HistoryIcon, TuneIcon } from '../ui/icons'
import type { WorkspaceSidebarCategory } from '../../lib/workspaceSidebarState'

const categories = [
  { id: 'skills', label: 'Skill', icon: TuneIcon },
  { id: 'workflows', label: 'Workflows', icon: HistoryIcon },
  { id: 'tools', label: 'Tools', icon: CodeIcon },
] as const

type Props = {
  activeCategory: WorkspaceSidebarCategory
  onSelect: (category: WorkspaceSidebarCategory) => void
}

export default function WorkspaceSidebarNav({ activeCategory, onSelect }: Props) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = (idx: number, e: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const nextIdx = e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? categories.length - 1
        : (idx + (e.key === 'ArrowDown' ? 1 : -1) + categories.length) % categories.length
    refs.current[nextIdx]?.focus()
    onSelect(categories[nextIdx].id)
  }

  return (
    <nav aria-label="扩展分类" className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-border/70 px-2 py-3 dark:border-white/[0.08]">
      {categories.map((category, idx) => {
        const Icon = category.icon
        const active = category.id === activeCategory
        return (
          <button
            key={category.id}
            ref={(el) => { refs.current[idx] = el }}
            type="button"
            aria-label={category.label}
            aria-pressed={active}
            title={category.label}
            onClick={() => onSelect(category.id)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors ${active
              ? 'bg-gray-200 text-gray-900 dark:bg-white/[0.12] dark:text-white'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200'
            }`}
          >
            <Icon className="h-5 w-5" />
          </button>
        )
      })}
    </nav>
  )
}
