import { ChevronLeftIcon } from '../../components/ui/icons'

type Props = {
  title: string
  onExit: () => void
  onBack?: () => void
}

export default function ExtensionHeader({ title, onExit, onBack }: Props) {
  const label = onBack ? '返回上一页' : '返回原应用'

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center border-b border-border bg-background/90 px-4 backdrop-blur dark:border-white/[0.08] md:h-16 md:px-6">
      <button type="button" aria-label={label} title={label} onClick={onBack ?? onExit} className={`mr-3 flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-muted hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-100 ${onBack ? '' : 'md:hidden'}`}>
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <h1 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
    </header>
  )
}
