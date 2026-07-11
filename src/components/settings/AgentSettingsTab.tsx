import {
  DEFAULT_AGENT_MAX_TOOL_ROUNDS,
  type ApiProfile,
  type AppSettings,
} from '../../types'
import { normalizeAgentMaxToolRounds } from '../../lib/apiProfiles'
import Select from '../Select'

interface SelectOption {
  label: string
  value: string
}

interface AgentSettingsTabProps {
  draft: AppSettings
  agentMaxToolRoundsInput: string
  agentTextProfileOptions: SelectOption[]
  agentImageProfileOptions: SelectOption[]
  selectedAgentTextProfile: ApiProfile | null
  selectedAgentImageProfile: ApiProfile | null
  setAgentMaxToolRoundsInput: (value: string) => void
  commitSettings: (nextDraft: AppSettings) => void
  commitAgentMaxToolRounds: () => void
}

export default function AgentSettingsTab({
  draft,
  agentMaxToolRoundsInput,
  agentTextProfileOptions,
  agentImageProfileOptions,
  selectedAgentTextProfile,
  selectedAgentImageProfile,
  setAgentMaxToolRoundsInput,
  commitSettings,
  commitAgentMaxToolRounds,
}: AgentSettingsTabProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
        Agent 固定使用 Sub2API 混合模式。文本与图像配置来自 Sub2API 设置页。
      </div>

      <div className="block">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="block text-sm text-gray-600 dark:text-gray-300">文本配置</span>
          <div className="w-56 shrink-0">
            {agentTextProfileOptions.length > 0 ? (
              <Select
                value={selectedAgentTextProfile?.id ?? ''}
                onChange={(value) => commitSettings({ ...draft, agentApiConfigMode: 'hybrid', agentTextProfileId: String(value) })}
                options={agentTextProfileOptions}
                className="w-full px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] text-xs shadow-sm text-gray-700 dark:text-gray-200 outline-none"
              />
            ) : <div className="rounded-xl border border-gray-200/60 px-3 py-1.5 text-center text-xs text-gray-500 dark:border-white/[0.08]">尚未配置</div>}
          </div>
        </div>
        <div className="text-xs text-gray-500">只列出 Sub2API 设置中保存的文本配置。</div>
      </div>

      <div className="block">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="block text-sm text-gray-600 dark:text-gray-300">图像配置</span>
          <div className="w-56 shrink-0">
            {agentImageProfileOptions.length > 0 ? (
              <Select
                value={selectedAgentImageProfile?.id ?? ''}
                onChange={(value) => commitSettings({ ...draft, agentApiConfigMode: 'hybrid', agentImageProfileId: String(value) })}
                options={agentImageProfileOptions}
                className="w-full px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] text-xs shadow-sm text-gray-700 dark:text-gray-200 outline-none"
              />
            ) : <div className="rounded-xl border border-gray-200/60 px-3 py-1.5 text-center text-xs text-gray-500 dark:border-white/[0.08]">尚未配置</div>}
          </div>
        </div>
        <div className="text-xs text-gray-500">只列出 Sub2API 设置中保存的生图配置。</div>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">最大工具调用轮数</span>
        <input
          value={agentMaxToolRoundsInput}
          onChange={(e) => setAgentMaxToolRoundsInput(e.target.value)}
          onBlur={commitAgentMaxToolRounds}
          type="number"
          min={1}
          max={50}
          className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
        />
        <div data-selectable-text className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-500">
          默认 15。用于限制 Agent 连续调用工具时的最大轮数，防止无限循环。
        </div>
      </label>
      <div className="block">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="block text-sm text-gray-600 dark:text-gray-300">网络搜索</span>
          <button
            type="button"
            onClick={() => {
              const agentMaxToolRounds = agentMaxToolRoundsInput.trim() === ''
                ? DEFAULT_AGENT_MAX_TOOL_ROUNDS
                : normalizeAgentMaxToolRounds(agentMaxToolRoundsInput, draft.agentMaxToolRounds)
              setAgentMaxToolRoundsInput(String(agentMaxToolRounds))
              commitSettings({ ...draft, agentMaxToolRounds, agentWebSearch: !draft.agentWebSearch })
            }}
            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${draft.agentWebSearch ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            role="switch"
            aria-checked={draft.agentWebSearch}
            aria-label="网络搜索"
          >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${draft.agentWebSearch ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
          </button>
        </div>
        <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
          启用 Responses API 的 <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] dark:bg-white/[0.06]">web_search</code> 工具。模型每次调用此工具会产生少量固定价格的额外计费。
        </div>
      </div>
    </div>
  )
}
