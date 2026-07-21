import type { PlannedWorkspaceTool, WorkspaceTool, WorkspaceToolEntry } from './types'
import imageEditor from './items/imageEditor/definition'
import backgroundRemover from './items/backgroundRemover/definition'
import videoEditor from './items/videoEditor/definition'

export function defineWorkspaceTools(items: WorkspaceTool[]) {
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Workspace Tool ID 重复：${item.id}`)
    ids.add(item.id)
  }
  return items
}

export const workspaceTools = defineWorkspaceTools([imageEditor, backgroundRemover, videoEditor])

export const plannedWorkspaceTools: PlannedWorkspaceTool[] = []

export const workspaceToolCards: WorkspaceToolEntry[] = [...workspaceTools, ...plannedWorkspaceTools]

export function getWorkspaceTool(id: string) {
  return workspaceTools.find((tool) => tool.id === id)
}
