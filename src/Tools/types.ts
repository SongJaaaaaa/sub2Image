import type { ComponentType } from 'react'

export type WorkspaceToolMedia = 'image' | 'video'

type WorkspaceToolBase = {
  id: string
  name: string
  description: string
  version: number
  media: WorkspaceToolMedia
  icon?: string
  cover?: string
  author?: string
}

export type WorkspaceTool = WorkspaceToolBase & {
  status?: 'ready'
  load: () => Promise<{ default: ComponentType }>
}

export type PlannedWorkspaceTool = WorkspaceToolBase & {
  status: 'planned'
}

export type WorkspaceToolEntry = WorkspaceTool | PlannedWorkspaceTool
