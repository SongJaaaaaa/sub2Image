import type { ConversationTool, ConversationToolModule } from '../types'

export function createToolRegistry(initialTools: readonly ConversationTool[] = []) {
  const tools = new Map<string, ConversationTool>()
  const loads = new Map<string, Promise<ConversationToolModule>>()
  const modules = new Map<string, ConversationToolModule>()

  const register = (tool: ConversationTool) => {
    if (!tool.id) throw new Error('Tool ID 不能为空')
    if (tools.has(tool.id)) throw new Error(`Tool ID 重复: ${tool.id}`)
    tools.set(tool.id, tool)
  }

  for (const tool of initialTools) register(tool)

  const get = (id: string) => tools.get(id)

  const load = async (id: string) => {
    const tool = get(id)
    if (!tool) throw new Error(`未知 Tool: ${id}`)

    const cached = loads.get(id)
    if (cached) return cached

    const pending = tool.load()
      .then((module) => {
        modules.set(id, module)
        return module
      })
      .catch((err) => {
        loads.delete(id)
        throw err
      })
    loads.set(id, pending)
    return pending
  }

  return {
    register,
    get,
    getAll: () => Array.from(tools.values()),
    getLoaded: (id: string) => modules.get(id),
    load,
  }
}

export type ConversationToolRegistry = ReturnType<typeof createToolRegistry>
