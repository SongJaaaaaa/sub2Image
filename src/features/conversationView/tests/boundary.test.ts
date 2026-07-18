/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

const sources = import.meta.glob('../**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

describe('conversation view boundary', () => {
  it('depends only on React and the public conversation protocol', () => {
    const imports = Object.entries(sources)
      .filter(([path]) => !path.includes('.test.'))
      .flatMap(([path, source]) => Array.from(source.matchAll(/from\s+['"]([^'"]+)['"]/g), (match) => ({ path, source: match[1] })))
    const invalid = imports.filter((item) => {
      if (item.source === 'react' || item.source === '../../conversationComposer') return false
      if (item.source.startsWith('./') || (item.source.startsWith('../') && !item.source.startsWith('../../'))) return false
      return true
    })

    expect(invalid).toEqual([])
  })

  it('does not contain concrete business message kinds', () => {
    const source = Object.entries(sources)
      .filter(([path]) => !path.includes('.test.'))
      .map(([, value]) => value)
      .join('\n')

    expect(source).not.toMatch(/chat\/text|agent\/web-search|prompt-studio\/question|image-generation\/result/)
  })
})
