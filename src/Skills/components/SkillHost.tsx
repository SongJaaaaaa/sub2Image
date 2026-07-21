import { ChevronLeftIcon } from '../../components/ui/icons'
import { getAgentSkill } from '../registry'

type Props = {
  skillId: string
  onBack: () => void
}

export default function SkillHost({ skillId, onBack }: Props) {
  const skill = getAgentSkill(skillId)

  if (!skill) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">未找到该技能</h2>
        <button type="button" onClick={onBack} className="mt-5 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          <ChevronLeftIcon className="h-4 w-4" />
          返回技能列表
        </button>
      </div>
    )
  }

  return (
    <article className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
        <span>v{skill.version}</span>
        <span>{skill.author}</span>
        <span>{skill.license}</span>
        <a href={skill.source} target="_blank" rel="noreferrer" className="underline decoration-gray-300 underline-offset-4 hover:text-gray-900 dark:decoration-gray-600 dark:hover:text-gray-100">查看开源项目</a>
      </div>
      <p className="mt-4 text-sm leading-7 text-gray-600 dark:text-gray-300">{skill.description}</p>
      <pre className="mt-6 whitespace-pre-wrap border-l-2 border-border pl-4 font-sans text-sm leading-7 text-gray-700 dark:border-white/[0.1] dark:text-gray-200">{skill.instructions}</pre>
    </article>
  )
}
