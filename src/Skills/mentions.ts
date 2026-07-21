import { getSelectedStructuredMentionLabel, getStructuredMentions, insertStructuredMentionAtVisibleRange } from '../lib/promptImageMentions'
import { getAgentSkill } from './registry'
import type { AgentSkill, AgentSkillRef } from './types'

export function createAgentSkillMention(skill: Pick<AgentSkill, 'id' | 'name'>) {
  return getSelectedStructuredMentionLabel(`@${skill.name}`, 'skill', skill.id)
}

export function insertAgentSkillMention(prompt: string, start: number, cursor: number, skill: Pick<AgentSkill, 'id' | 'name'>) {
  return insertStructuredMentionAtVisibleRange(prompt, start, cursor, `@${skill.name}`, 'skill', skill.id)
}

export function getAgentSkillMention(prompt: string): AgentSkillRef | null {
  const mention = getStructuredMentions(prompt).find((item) => item.type === 'skill')
  if (!mention) return null
  const skill = getAgentSkill(mention.id)
  return skill ? { id: skill.id, name: skill.name, version: skill.version } : null
}

export function extractAgentSkillMention(prompt: string) {
  const skill = getAgentSkillMention(prompt)
  const text = getStructuredMentions(prompt)
    .filter((item) => item.type === 'skill')
    .reduce((value, item) => value.replace(item.raw, ''), prompt)
    .trim()
  return { text, skill }
}
