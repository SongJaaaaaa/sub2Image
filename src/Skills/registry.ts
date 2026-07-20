import type { GenerationSkill } from './types'

export function defineGenerationSkills(items: GenerationSkill[]) {
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Generation Skill ID 重复：${item.id}`)
    ids.add(item.id)
  }
  return items
}

export const generationSkills = defineGenerationSkills([])

export function getGenerationSkill(id: string) {
  return generationSkills.find((skill) => skill.id === id)
}
