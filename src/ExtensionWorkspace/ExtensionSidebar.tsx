import { ChevronLeftIcon, CodeIcon, TuneIcon } from '../components/ui/icons'
import type { ExtensionSection } from './extensionRoutes'

const sections = [
  { id: 'tools', label: 'Tools', icon: CodeIcon },
  { id: 'skills', label: 'Skills', icon: TuneIcon },
] as const

type Props = {
  activeSection: ExtensionSection
  onSelect: (section: ExtensionSection) => void
  onExit: () => void
}

export default function ExtensionSidebar({ activeSection, onSelect, onExit }: Props) {
  return (
    <aside className="border-b border-border bg-sidebar dark:border-white/[0.08] dark:bg-gray-950 md:sticky md:top-0 md:flex md:h-svh md:w-60 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
      <div className="flex h-16 items-center px-4 md:h-auto md:px-5 md:pb-5 md:pt-6">
        <div>
          <div className="text-base font-bold text-gray-900 dark:text-gray-100">JWS Image</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">拓展工作区</div>
        </div>
      </div>

      <nav aria-label="拓展工作区导航" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-3 md:pb-0">
        {sections.map((section) => {
          const Icon = section.icon
          const active = activeSection === section.id
          return (
            <button
              key={section.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(section.id)}
              className={`flex h-10 shrink-0 items-center gap-3 rounded-md px-3 text-sm transition-colors md:w-full ${active
                ? 'bg-gray-200 font-medium text-gray-900 dark:bg-white/[0.12] dark:text-white'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-100'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {section.label}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto hidden p-3 md:block">
        <button type="button" onClick={onExit} className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-100">
          <ChevronLeftIcon className="h-[18px] w-[18px]" />
          返回原应用
        </button>
      </div>
    </aside>
  )
}
