import { CodeIcon } from '../../components/ui/icons'
import type { WorkspaceTool } from '../types'

type Props = {
  tools: WorkspaceTool[]
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

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => onSelect(tool.id)}
          className="rounded-lg border border-border bg-sidebar p-4 text-left transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-white/[0.08] dark:bg-gray-900 dark:hover:bg-white/[0.06]"
        >
          <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{tool.name}</span>
          <span className="mt-2 block text-sm leading-6 text-gray-500 dark:text-gray-400">{tool.description}</span>
          <span className="mt-4 block text-xs text-gray-400 dark:text-gray-500">v{tool.version}</span>
        </button>
      ))}
    </div>
  )
}
