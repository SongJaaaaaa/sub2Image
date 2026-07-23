import { useState } from 'react'
import { ChevronLeftIcon, CloudIcon, TrashIcon } from '../../components/ui/icons'
import { getAgentSkill, removeAgentSkill } from '../registry'

type Props = {
  skillId: string
  onBack: () => void
  cloudState?: 'saving' | 'saved' | 'removing' | 'error'
  onSaveCloud?: (id: string) => Promise<void>
  onRemoveCloud?: (id: string) => Promise<void>
}

export default function SkillHost({ skillId, onBack, cloudState, onSaveCloud, onRemoveCloud }: Props) {
  const skill = getAgentSkill(skillId)
  const [error, setError] = useState('')

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
        {skill.uploaded && <span>用户导入</span>}
        <span>v{skill.version}</span>
        <span>{skill.author}</span>
        <span>{skill.license}</span>
        <a href={skill.source} target="_blank" rel="noreferrer" className="underline decoration-gray-300 underline-offset-4 hover:text-gray-900 dark:decoration-gray-600 dark:hover:text-gray-100">{skill.uploaded ? '查看来源' : '查看开源项目'}</a>
      </div>
      <p className="mt-4 text-sm leading-7 text-gray-600 dark:text-gray-300">{skill.description}</p>
      <pre className="mt-6 whitespace-pre-wrap border-l-2 border-border pl-4 font-sans text-sm leading-7 text-gray-700 dark:border-white/[0.1] dark:text-gray-200">{skill.instructions}</pre>
      {skill.uploaded && (
        <div className="mt-8 flex flex-wrap items-center gap-4">
          {onSaveCloud && onRemoveCloud && (
            <button
              type="button"
              disabled={cloudState === 'saving' || cloudState === 'removing'}
              onClick={() => {
                setError('')
                const action = cloudState === 'saved' ? onRemoveCloud : onSaveCloud
                if (cloudState === 'saved' && !window.confirm(`确定将 Skill「${skill.name}」移出云端吗？当前浏览器中的 Skill 会保留。`)) return
                void action(skill.id).catch((err) => setError(err instanceof Error ? err.message : '云端操作失败'))
              }}
              className="inline-flex h-9 items-center gap-2 rounded-md text-sm text-blue-600 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <CloudIcon className="h-4 w-4" />
              {cloudState === 'saving' ? '正在保存' : cloudState === 'removing' ? '正在移出' : cloudState === 'saved' ? '移出云端' : cloudState === 'error' ? '重试保存' : '保存到云端'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`确定删除 Skill「${skill.name}」吗？`)) return
              removeAgentSkill(skill.id)
              onBack()
            }}
            className="inline-flex h-9 items-center gap-2 rounded-md text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            <TrashIcon className="h-4 w-4" />
            删除本地 Skill
          </button>
          {error && <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </article>
  )
}
