import type { AgentSkillRef } from '../types'

export type AgentSkill = {
  id: string
  name: string
  description: string
  version: number
  author: string
  source: string
  license: string
  order: number
  instructions: string
  uploaded?: boolean
  fileName?: string
}

export type { AgentSkillRef }
