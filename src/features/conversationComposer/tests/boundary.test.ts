/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

const blocked = [
  '/promptStudio/',
  '/imageGeneration/',
  '/integrations/',
  '/store',
]

const sources = import.meta.glob('../**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

describe('conversation composer boundary', () => {
  it('does not import concrete Tools or current application business modules', () => {
    const imports = Object.entries(sources)
      .filter(([path]) => !path.includes('/tests/'))
      .flatMap(([path, source]) => Array.from(source.matchAll(/from\s+['"]([^'"]+)['"]/g), (match) => ({ path, source: match[1] })))

    expect(imports.filter((item) => blocked.some((part) => item.source.includes(part)))).toEqual([])
  })
})
