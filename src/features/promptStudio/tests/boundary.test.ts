/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest'

const blockedImports = [
  'zustand',
  '/integrations/',
  '/lib/',
  '../../types',
]

const blockedPureImports = ['react']

const blockedPureGlobals = [
  /\bfetch\s*\(/,
  /\bindexedDB\b/,
  /\blocalStorage\b/,
]

const sources = import.meta.glob('../**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

describe('prompt studio boundary', () => {
  it('keeps the core pure and does not depend on current app internals', () => {
    const files = Object.entries(sources).filter(([path]) => !path.includes('/tests/'))
    const imports = files.flatMap(([path, source]) => [
      ...Array.from(source.matchAll(/from\s+['"]([^'"]+)['"]/g), (match) => ({ path, source: match[1] })),
      ...Array.from(source.matchAll(/(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g), (match) => ({ path, source: match[1] })),
    ])
    const pureFiles = files.filter(([path]) => ['/core/', '/domains/', '/ports/'].some((part) => path.includes(part)))
    const purePaths = new Set(pureFiles.map(([path]) => path))
    const pureImports = imports.filter((item) => purePaths.has(item.path))
    const globals = pureFiles.flatMap(([path, source]) =>
      blockedPureGlobals.filter((pattern) => pattern.test(source)).map((pattern) => ({ path, pattern: pattern.source })))

    expect(imports.filter((item) =>
      blockedImports.some((part) => item.source.includes(part)) || /\/store(?:\.[jt]sx?)?$/.test(item.source),
    )).toEqual([])
    expect(pureImports.filter((item) => blockedPureImports.some((part) => item.source.includes(part)))).toEqual([])
    expect(globals).toEqual([])
  })
})
