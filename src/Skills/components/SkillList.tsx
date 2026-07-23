import { useRef, useState } from 'react'
import type { AgentSkill } from '../types'
import { ImportIcon, TuneIcon } from '../../components/ui/icons'
import { importAgentSkill } from '../registry'

type Props = {
  skills: AgentSkill[]
  onSelect: (id: string) => void
  onImported?: (skill: AgentSkill) => void
}

export default function SkillList({ skills, onSelect, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  const importSkill = async (file?: File) => {
    if (!file) return
    setError('')
    setImporting(true)
    try {
      const skill = await importAgentSkill(file)
      onImported?.(skill)
      onSelect(skill.id)
    } catch (err) {
      console.warn('导入 Skill 失败：', err)
      setError(err instanceof Error ? err.message : '导入 Skill 失败')
    } finally {
      setImporting(false)
    }
  }

  if (!skills.length) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
        <TuneIcon className="h-9 w-9 text-gray-400 dark:text-gray-500" />
        <h2 className="mt-5 text-base font-semibold text-gray-900 dark:text-gray-100">尚无已注册技能</h2>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex min-h-10 flex-wrap items-center justify-end gap-3">
        {error && <p role="alert" className="mr-auto text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="button"
          disabled={importing}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.1] dark:text-gray-200 dark:hover:bg-white/[0.06]"
        >
          <ImportIcon className="h-4 w-4" />
          {importing ? '正在导入' : '导入 Skill'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".md,text/markdown"
          className="hidden"
          aria-label="选择 Markdown Skill 文件"
          onChange={(event) => {
            void importSkill(event.currentTarget.files?.[0])
            event.currentTarget.value = ''
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {skills.map((skill) => (
          <button
            key={skill.id}
            type="button"
            aria-label={`查看 ${skill.name}`}
            onClick={() => onSelect(skill.id)}
            className="rounded-lg border border-border bg-sidebar p-4 text-left transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-white/[0.08] dark:bg-gray-900 dark:hover:bg-white/[0.06]"
          >
            <span className="flex items-center justify-between gap-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <span>{skill.name}</span>
              {skill.uploaded && <span className="text-xs font-normal text-gray-400 dark:text-gray-500">用户导入</span>}
            </span>
            <span className="mt-2 block text-sm leading-6 text-gray-500 dark:text-gray-400">{skill.description}</span>
            <span className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-400 dark:text-gray-500">
              <span>{skill.author}</span>
              <span>{skill.license}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
