export type ExtensionStatus = 'available' | 'coming-soon'

export type ExtensionEntry = {
  id: string
  name: string
  description: string
  icon?: string
  status?: ExtensionStatus
}

export function defineExtensions<T extends ExtensionEntry>(items: T[]) {
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`扩展 ID 重复：${item.id}`)
    ids.add(item.id)
  }
  return items
}
