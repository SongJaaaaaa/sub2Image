import type { WorkspaceTool } from './types'

export function defineWorkspaceTools(items: WorkspaceTool[]) {
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Workspace Tool ID 重复：${item.id}`)
    ids.add(item.id)
  }
  return items
}

export const workspaceTools = defineWorkspaceTools([])

export function getWorkspaceTool(id: string) {
  return workspaceTools.find((tool) => tool.id === id)
}
