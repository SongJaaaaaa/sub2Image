import { CodeIcon } from '../../components/ui/icons'
import type { WorkspaceToolEntry } from '../types'

type Props = {
  tools: WorkspaceToolEntry[]
  onSelect: (id: string) => void
}

export default function ToolList({ tools, onSelect }: Props) {
  if (!tools.length) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
        <CodeIcon className="h-9 w-9 text-gray-400 dark:text-gray-500" />
        <h2 className="mt-5 text-base font-semibold text-gray-900 dark:text-gray-100">尚无已注册工具</h2>
      </div>
    )
  }

  const groups = [
    { id: 'image', title: '图片工具' },
    { id: 'video', title: '视频工具' },
  ] as const

  return (
    <div className="space-y-10">
      {groups.map((group) => {
        const items = tools.filter((tool) => tool.media === group.id)
        if (!items.length) return null

        return (
          <section key={group.id} aria-labelledby={`${group.id}-tools-title`}>
            <h2 id={`${group.id}-tools-title`} className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">{group.title}</h2>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((tool) => (
                <div
                  key={tool.id}
                  data-tool-id={tool.id}
                  data-tool-status={tool.status ?? 'ready'}
                  role={tool.status === 'planned' ? undefined : 'button'}
                  tabIndex={tool.status === 'planned' ? undefined : 0}
                  aria-label={tool.status === 'planned' ? undefined : `打开${tool.name}`}
                  onClick={tool.status === 'planned' ? undefined : () => onSelect(tool.id)}
                  onKeyDown={tool.status === 'planned' ? undefined : (event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelect(tool.id)
                  }}
                  className={`group overflow-hidden rounded-2xl border border-border bg-sidebar text-left shadow-sm dark:border-white/[0.08] dark:bg-gray-900 ${tool.status === 'planned' ? 'opacity-85' : 'transition hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-lg'}`}
                >
                  {tool.cover && (
                    <span className="relative z-0 block aspect-[16/9] overflow-hidden bg-gray-100 dark:bg-gray-800">
                      <img src={tool.cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                    </span>
                  )}
                  <span className="relative z-10 flex gap-3 bg-sidebar px-4 pb-4 pt-3 dark:bg-gray-900">
                    {tool.icon && (
                      <img src={tool.icon} alt="" className="relative z-20 -mt-8 h-14 w-14 shrink-0 rounded-2xl border-2 border-sidebar object-cover shadow-md dark:border-gray-900" />
                    )}
                    <span className="min-w-0 pt-0.5">
                      <span className="block text-base font-semibold text-gray-900 dark:text-gray-100">{tool.name}</span>
                      {tool.author && <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{tool.author}</span>}
                      <span className="mt-2 block text-sm leading-6 text-gray-600 dark:text-gray-300">{tool.description}</span>
                      <span className="mt-3 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                        <span>v{tool.version}</span>
                        {tool.status === 'planned' && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-gray-600 dark:bg-white/[0.1] dark:text-gray-300">开发中</span>}
                      </span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
