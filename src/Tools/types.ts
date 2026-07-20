import type { ComponentType } from 'react'

export type WorkspaceTool = {
  id: string
  name: string
  description: string
  version: number
  icon?: string
  load: () => Promise<{ default: ComponentType }>
}
