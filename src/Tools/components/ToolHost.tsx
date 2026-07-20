import { lazy, Suspense, useMemo } from 'react'
import { ChevronLeftIcon } from '../../components/ui/icons'
import { getWorkspaceTool } from '../registry'

type Props = {
  toolId: string
  onBack: () => void
}

export default function ToolHost({ toolId, onBack }: Props) {
  const tool = getWorkspaceTool(toolId)
  const Tool = useMemo(() => tool ? lazy(tool.load) : null, [tool])

  if (!tool || !Tool) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">未找到该工具</h2>
        <button type="button" onClick={onBack} className="mt-5 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          <ChevronLeftIcon className="h-4 w-4" />
          返回工具列表
        </button>
      </div>
    )
  }

  return (
    <Suspense fallback={<div className="flex min-h-[320px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">正在加载 {tool.name}</div>}>
      <Tool />
    </Suspense>
  )
}
