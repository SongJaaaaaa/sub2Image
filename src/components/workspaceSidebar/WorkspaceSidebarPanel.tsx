import type { ExtensionEntry } from '../../extensions'
import { skills, tools, workflows } from '../../extensions'
import type { WorkspaceSidebarCategory } from '../../lib/workspaceSidebarState'
import { CloseIcon } from '../ui/icons'

const content = {
  skills: { title: 'Skill', empty: '暂时还没有 Skill', items: skills },
  workflows: { title: 'Workflows', empty: '暂时还没有 Workflow', items: workflows },
  tools: { title: 'Tools', empty: '暂时还没有 Tool', items: tools },
} satisfies Record<WorkspaceSidebarCategory, { title: string; empty: string; items: ExtensionEntry[] }>

type Props = {
  activeCategory: WorkspaceSidebarCategory
  onClose: () => void
}

export default function WorkspaceSidebarPanel({ activeCategory, onClose }: Props) {
  const current = content[activeCategory]

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label={`${current.title} 扩展`}>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-4 dark:border-white/[0.08]">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{current.title}</h2>
        <button
          type="button"
          aria-label="收起扩展侧边栏"
          title="收起"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.07] dark:hover:text-gray-200"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {current.items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-sm text-gray-400 dark:text-gray-500">
          {current.empty}
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto p-3">
          {current.items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.status === 'coming-soon'}
              className="w-full rounded-md border border-border/70 bg-white/50 p-3 text-left transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
            >
              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
              <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{item.description}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
