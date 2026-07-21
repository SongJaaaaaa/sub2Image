import type { AgentSkill, AgentSkillRef } from './types'

const docs = import.meta.glob('./builtins/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const REQUIRED_FIELDS = ['id', 'name', 'description', 'version', 'author', 'source', 'license'] as const

export function parseAgentSkill(raw: string, fileName = 'SKILL.md'): AgentSkill {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/)
  if (!match) throw new Error(`${fileName} 缺少有效的 YAML frontmatter`)

  const meta = Object.fromEntries(match[1].split(/\r?\n/).flatMap((line) => {
    const idx = line.indexOf(':')
    if (idx < 1) return []
    return [[line.slice(0, idx).trim(), line.slice(idx + 1).trim()]]
  }))

  for (const key of REQUIRED_FIELDS) {
    if (!meta[key]) throw new Error(`${fileName} 缺少 ${key}`)
  }

  const version = Number(meta.version)
  const order = Number(meta.order ?? 999)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.id)) throw new Error(`${fileName} 的 id 格式无效`)
  if (!Number.isInteger(version) || version < 1) throw new Error(`${fileName} 的 version 格式无效`)
  if (!Number.isFinite(order)) throw new Error(`${fileName} 的 order 格式无效`)

  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    version,
    author: meta.author,
    source: meta.source,
    license: meta.license,
    order,
    instructions: match[2].trim(),
  }
}

export function defineAgentSkills(items: AgentSkill[]) {
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Agent Skill ID 重复：${item.id}`)
    ids.add(item.id)
  }
  return [...items].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'))
}

export const agentSkills = defineAgentSkills(
  Object.entries(docs).map(([fileName, raw]) => parseAgentSkill(raw, fileName)),
)

export function getAgentSkill(id: string) {
  return agentSkills.find((skill) => skill.id === id)
}

export function getAgentSkillRef(id: string): AgentSkillRef | null {
  const skill = getAgentSkill(id)
  return skill ? { id: skill.id, name: skill.name, version: skill.version } : null
}

export function getAgentSkillInstructions(ref: AgentSkillRef | null | undefined) {
  if (!ref) return null
  const skill = getAgentSkill(ref.id)
  if (!skill || skill.version !== ref.version) return null
  return skill.instructions
}
