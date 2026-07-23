/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

const workspaceSources = import.meta.glob('../**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const toolSources = import.meta.glob('../../Tools/**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const toolItemSources = import.meta.glob('../../Tools/items/**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const skillSources = import.meta.glob('../../Skills/**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const oldExtensionSources = import.meta.glob('../../extensions/**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const oldSidebarSources = import.meta.glob('../../components/workspaceSidebar/**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const productionSource = (sources: Record<string, string>) => Object.entries(sources)
  .filter(([path]) => !path.includes('.test.'))
  .map(([, source]) => source)
  .join('\n')

describe('extension module boundaries', () => {
  it('imports Tools and Skills only through their public roots', () => {
    const code = productionSource(workspaceSources)
    expect(code).not.toMatch(/from ['"]\.\.\/Tools\//)
    expect(code).not.toMatch(/from ['"]\.\.\/Skills\//)
    expect(code).not.toMatch(/from ['"][^'"]*(?:features\/cloud|lib\/sub2api|state\/appStore)/)
    expect(code.toLowerCase()).not.toContain('workflows')
  })

  it('keeps Tools and Skills independent from each other and business internals', () => {
    const tools = productionSource(toolSources)
    const toolItems = productionSource(toolItemSources)
    const skills = productionSource(skillSources)
    expect(tools).not.toMatch(/from ['"][^'"]*Skills/)
    expect(skills).not.toMatch(/from ['"][^'"]*Tools/)
    expect(toolItems).not.toMatch(/from ['"][^'"]*(?:store|features)\//)
    expect(skills).not.toMatch(/from ['"][^'"]*(?:store|features)\//)
  })

  it('does not retain old extension source files', () => {
    expect(Object.keys(oldExtensionSources)).toEqual([])
    expect(Object.keys(oldSidebarSources)).toEqual([])
  })
})
