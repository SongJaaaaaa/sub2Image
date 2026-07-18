import { describe, expect, it, vi } from 'vitest'
import type { ConversationToolModule } from '../types'
import { createToolRegistry } from '../runtime/toolRegistry'

const module: ConversationToolModule = {
  messageRenderers: {},
  validate: () => null,
  submit: async () => undefined,
}

describe('conversation tool registry', () => {
  const createTool = (id: string, label = id) => ({
    id,
    label,
    getComposerState: ({ running }: { running: boolean }) => ({
      placeholder: `${label} placeholder`,
      canSubmit: !running,
      validationError: null,
      running,
    }),
    load: async () => module,
  })

  it('rejects duplicate and empty Tool IDs', () => {
    const registry = createToolRegistry([createTool('chat', '对话')])

    expect(() => registry.register(createTool('chat', '重复'))).toThrow('Tool ID 重复: chat')
    expect(() => registry.register(createTool('', '空'))).toThrow('Tool ID 不能为空')
  })

  it('reports unknown Tools clearly', async () => {
    const registry = createToolRegistry()

    expect(registry.get('missing')).toBeUndefined()
    await expect(registry.load('missing')).rejects.toThrow('未知 Tool: missing')
  })

  it('loads a Tool once and shares the pending load', async () => {
    const load = vi.fn(async () => module)
    const registry = createToolRegistry([{ ...createTool('chat', '对话'), load }])

    const [first, second] = await Promise.all([registry.load('chat'), registry.load('chat')])

    expect(first).toBe(module)
    expect(second).toBe(module)
    expect(load).toHaveBeenCalledOnce()
    expect(registry.getLoaded('chat')).toBe(module)
  })

  it('allows retry after a load failure', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('加载失败'))
      .mockResolvedValueOnce(module)
    const registry = createToolRegistry([{ ...createTool('chat', '对话'), load }])

    await expect(registry.load('chat')).rejects.toThrow('加载失败')
    await expect(registry.load('chat')).resolves.toBe(module)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('registers and loads a new dummy Tool without changing the registry', async () => {
    const registry = createToolRegistry()
    registry.register(createTool('dummy', '测试'))

    expect(registry.getAll().map((tool) => tool.id)).toEqual(['dummy'])
    await expect(registry.load('dummy')).resolves.toBe(module)
  })
})
