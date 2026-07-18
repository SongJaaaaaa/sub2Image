import type { PromptDomainDefinition } from '../types'

export function createPromptDomainRegistry(initial: readonly PromptDomainDefinition[] = []) {
  const domains = new Map<string, PromptDomainDefinition>()

  const register = (domain: PromptDomainDefinition) => {
    if (!domain.id.trim()) throw new Error('领域 ID 不能为空')
    if (domains.has(domain.id)) throw new Error(`领域 ID 重复: ${domain.id}`)
    domains.set(domain.id, domain)
  }

  initial.forEach(register)

  return {
    register,
    get: (id: string) => domains.get(id),
    require: (id: string) => {
      const domain = domains.get(id)
      if (!domain) throw new Error(`未知提示词领域: ${id}`)
      return domain
    },
    getAll: () => [...domains.values()],
  }
}
