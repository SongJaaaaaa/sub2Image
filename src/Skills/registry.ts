import type { AgentSkill, AgentSkillRef } from './types'

const docs = import.meta.glob('./builtins/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const REQUIRED_FIELDS = ['id', 'name', 'description', 'version', 'author', 'source', 'license'] as const
const STORAGE_KEY = 'gpt-image-playground-agent-skills'
export const MAX_AGENT_SKILL_FILE_SIZE = 256 * 1024

type UploadedDoc = {
  fileName: string
  raw: string
  skill: AgentSkill
}

export type UploadedAgentSkillDoc = {
  id: string
  version: number
  fileName: string
  raw: string
}

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

  const instructions = match[2].trim()
  if (!instructions) throw new Error(`${fileName} 缺少指令正文`)

  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    version,
    author: meta.author,
    source: meta.source,
    license: meta.license,
    order,
    instructions,
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

const builtinSkills = defineAgentSkills(
  Object.entries(docs).map(([fileName, raw]) => parseAgentSkill(raw, fileName)),
)

function validateUploadedSkill(skill: AgentSkill, fileName: string) {
  if (skill.name.length > 80) throw new Error(`${fileName} 的 name 不能超过 80 个字符`)
  if (skill.description.length > 300) throw new Error(`${fileName} 的 description 不能超过 300 个字符`)
  if (skill.author.length > 120) throw new Error(`${fileName} 的 author 不能超过 120 个字符`)
  if (skill.license.length > 80) throw new Error(`${fileName} 的 license 不能超过 80 个字符`)
  if (skill.source.length > 2048) throw new Error(`${fileName} 的 source 不能超过 2048 个字符`)

  try {
    const url = new URL(skill.source)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error()
  } catch {
    throw new Error(`${fileName} 的 source 必须是 HTTP/HTTPS 地址`)
  }
}

function readUploadedDocs() {
  if (typeof window === 'undefined') return []

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const values = JSON.parse(saved) as unknown
    if (!Array.isArray(values)) throw new Error('本地 Skill 数据格式无效')

    const result: UploadedDoc[] = []
    const ids = new Set(builtinSkills.map((skill) => skill.id))
    for (const value of values) {
      if (!value || typeof value !== 'object') continue
      const doc = value as { fileName?: unknown; raw?: unknown }
      if (typeof doc.fileName !== 'string' || typeof doc.raw !== 'string') continue
      if (!doc.fileName.toLowerCase().endsWith('.md')) continue
      if (new TextEncoder().encode(doc.raw).byteLength > MAX_AGENT_SKILL_FILE_SIZE) continue

      try {
        const parsed = parseAgentSkill(doc.raw, doc.fileName)
        validateUploadedSkill(parsed, doc.fileName)
        if (ids.has(parsed.id)) throw new Error(`Agent Skill ID 重复：${parsed.id}`)
        ids.add(parsed.id)
        result.push({
          fileName: doc.fileName,
          raw: doc.raw,
          skill: { ...parsed, uploaded: true, fileName: doc.fileName },
        })
      } catch (err) {
        console.warn('忽略无效的本地 Skill：', err)
      }
    }
    return result
  } catch (err) {
    console.warn('读取本地 Skill 失败：', err)
    return []
  }
}

let uploadedDocs = readUploadedDocs()

export const agentSkills = defineAgentSkills([
  ...builtinSkills,
  ...uploadedDocs.map((doc) => doc.skill),
])

function saveUploadedDocs(docs: UploadedDoc[]) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(
      docs.map((doc) => ({ fileName: doc.fileName, raw: doc.raw })),
    ))
  }
  uploadedDocs = docs
  agentSkills.splice(0, agentSkills.length, ...defineAgentSkills([
    ...builtinSkills,
    ...docs.map((doc) => doc.skill),
  ]))
}

export async function importAgentSkill(file: File) {
  if (!file.name.toLowerCase().endsWith('.md')) throw new Error('只能上传 .md 文件')
  if (file.size > MAX_AGENT_SKILL_FILE_SIZE) throw new Error('Skill 文件不能超过 256 KB')

  let raw = ''
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
  } catch {
    throw new Error('Skill 文件必须是有效的 UTF-8 文本')
  }

  const parsed = parseAgentSkill(raw, file.name)
  validateUploadedSkill(parsed, file.name)
  if (agentSkills.some((skill) => skill.id === parsed.id)) throw new Error(`Skill ID 已存在：${parsed.id}`)

  const skill = { ...parsed, uploaded: true, fileName: file.name }
  saveUploadedDocs([...uploadedDocs, { fileName: file.name, raw, skill }])
  return skill
}

export function removeAgentSkill(id: string) {
  const skill = getAgentSkill(id)
  if (!skill?.uploaded) return false
  saveUploadedDocs(uploadedDocs.filter((doc) => doc.skill.id !== id))
  return true
}

export function getUploadedAgentSkillDocs(): UploadedAgentSkillDoc[] {
  return uploadedDocs.map((doc) => ({
    id: doc.skill.id,
    version: doc.skill.version,
    fileName: doc.fileName,
    raw: doc.raw,
  }))
}

export function getUploadedAgentSkillDoc(id: string) {
  return getUploadedAgentSkillDocs().find((doc) => doc.id === id) ?? null
}

export function restoreAgentSkill(raw: string, fileName: string, overwrite = false) {
  if (!fileName.toLowerCase().endsWith('.md')) throw new Error('只能恢复 .md Skill')
  if (new TextEncoder().encode(raw).byteLength > MAX_AGENT_SKILL_FILE_SIZE) throw new Error('Skill 文件不能超过 256 KB')

  const parsed = parseAgentSkill(raw, fileName)
  validateUploadedSkill(parsed, fileName)
  const current = getAgentSkill(parsed.id)
  if (current && !current.uploaded) throw new Error(`Skill ID 与内置 Skill 冲突：${parsed.id}`)
  if (current && !overwrite) {
    const doc = uploadedDocs.find((item) => item.skill.id === parsed.id)
    if (doc?.raw === raw) return current
    throw new Error(`Skill ID 已存在：${parsed.id}`)
  }

  const skill = { ...parsed, uploaded: true, fileName }
  const docs = current
    ? uploadedDocs.map((doc) => doc.skill.id === parsed.id ? { fileName, raw, skill } : doc)
    : [...uploadedDocs, { fileName, raw, skill }]
  saveUploadedDocs(docs)
  return skill
}

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
