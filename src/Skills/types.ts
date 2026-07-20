export type GenerationSkillSupport = 'text-to-image' | 'image-to-image'

export type GenerationSkill = {
  id: string
  name: string
  description: string
  version: number
  instructions: string
  supports: GenerationSkillSupport[]
  defaults?: {
    size?: string
    quality?: string
    count?: number
  }
}
