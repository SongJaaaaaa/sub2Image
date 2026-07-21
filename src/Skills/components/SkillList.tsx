import { TuneIcon } from '../../components/ui/icons'
import type { AgentSkill } from '../types'

type Props = {
  skills: AgentSkill[]
  onSelect: (id: string) => void
}

export default function SkillList({ skills, onSelect }: Props) {
  if (!skills.length) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
        <TuneIcon className="h-9 w-9 text-gray-400 dark:text-gray-500" />
        <h2 className="mt-5 text-base font-semibold text-gray-900 dark:text-gray-100">尚无已注册技能</h2>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {skills.map((skill) => (
        <button
          key={skill.id}
          type="button"
          aria-label={`查看 ${skill.name}`}
          onClick={() => onSelect(skill.id)}
          className="rounded-lg border border-border bg-sidebar p-4 text-left transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-white/[0.08] dark:bg-gray-900 dark:hover:bg-white/[0.06]"
        >
          <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{skill.name}</span>
          <span className="mt-2 block text-sm leading-6 text-gray-500 dark:text-gray-400">{skill.description}</span>
          <span className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-400 dark:text-gray-500">
            <span>{skill.author}</span>
            <span>{skill.license}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
