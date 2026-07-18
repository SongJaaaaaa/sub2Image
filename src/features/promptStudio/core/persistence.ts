import type { PromptProject, PromptStudioSourceSnapshot } from '../types'

export const PROMPT_REQUEST_INTERRUPTED_MESSAGE = '上次请求已中断，可重试'

const PROMPT_PROJECT_SCHEMA_VERSION = 1
const PROMPT_PROJECT_PHASES = new Set([
  'extracting',
  'interview',
  'review',
  'generating',
  'ready',
  'error',
])

export function migratePromptProject(value: unknown): PromptProject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('提示词项目数据无效')
  }

  const raw = value as Record<string, unknown>
  const version = raw.schemaVersion ?? 0
  if (version !== 0 && version !== PROMPT_PROJECT_SCHEMA_VERSION) {
    throw new Error(`不支持的提示词项目版本：${String(version)}`)
  }
  if (
    typeof raw.id !== 'string' ||
    typeof raw.domain !== 'string' ||
    typeof raw.title !== 'string' ||
    typeof raw.createdAt !== 'number' ||
    typeof raw.updatedAt !== 'number' ||
    typeof raw.phase !== 'string' ||
    !PROMPT_PROJECT_PHASES.has(raw.phase) ||
    !raw.source || typeof raw.source !== 'object' || Array.isArray(raw.source) ||
    !raw.brief || typeof raw.brief !== 'object' ||
    !Array.isArray(raw.messages) ||
    !Array.isArray(raw.pendingConflicts) ||
    !Array.isArray(raw.versions)
  ) {
    throw new Error('提示词项目数据缺少必要字段')
  }
  if (raw.conversationId != null && typeof raw.conversationId !== 'string') {
    throw new Error('提示词项目 conversationId 无效')
  }

  return recoverInterruptedPromptProject({
    ...raw,
    source: migratePromptSource(raw.source as PromptStudioSourceSnapshot),
    schemaVersion: PROMPT_PROJECT_SCHEMA_VERSION,
  } as PromptProject)
}

export function recoverInterruptedPromptProject(project: PromptProject): PromptProject {
  if (project.phase !== 'extracting' && project.phase !== 'generating') return project

  const id = `prompt-interrupted-${project.id}-${project.updatedAt}`
  const messages = project.messages.some((msg) => msg.id === id)
    ? project.messages
    : [
        ...project.messages,
        {
          id,
          role: 'assistant' as const,
          content: PROMPT_REQUEST_INTERRUPTED_MESSAGE,
          createdAt: project.updatedAt,
        },
      ]

  return {
    ...project,
    messages,
    phase: 'error',
  }
}

function migratePromptSource(source: PromptStudioSourceSnapshot): PromptStudioSourceSnapshot {
  if (!source.assets) return source
  return {
    ...source,
    assets: source.assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      label: asset.label,
      ...(asset.role ? { role: asset.role } : {}),
      ...(asset.width != null ? { width: asset.width } : {}),
      ...(asset.height != null ? { height: asset.height } : {}),
    })),
  }
}
