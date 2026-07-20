// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ExtensionWorkspace from '../ExtensionWorkspace'

describe('ExtensionWorkspace', () => {
  beforeEach(() => window.history.replaceState(null, '', '/app/extensions'))
  afterEach(cleanup)

  it('switches between Tools and Skills with pathname navigation', () => {
    render(<ExtensionWorkspace />)

    expect(screen.getByRole('button', { name: 'Tools' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('尚无已注册工具')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Skills' }))
    expect(window.location.pathname).toBe('/app/extensions/skills')
    expect(screen.getByText('尚无已注册技能')).toBeTruthy()
  })

  it('shows an unknown item state and returns to the list', () => {
    window.history.replaceState(null, '', '/app/extensions/tools/missing')
    render(<ExtensionWorkspace />)

    expect(screen.getByText('未找到该工具')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回工具列表' }))
    expect(window.location.pathname).toBe('/app/extensions/tools')
    expect(screen.getByText('尚无已注册工具')).toBeTruthy()
  })

  it('returns to the original app', () => {
    render(<ExtensionWorkspace />)

    fireEvent.click(screen.getAllByRole('button', { name: '返回原应用' })[0])
    expect(window.location.pathname).toBe('/app')
  })
})
