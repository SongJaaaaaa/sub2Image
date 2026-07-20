// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openWorkspaceSidebar } from '../../lib/workspaceSidebarState'
import WorkspaceSidebar from './WorkspaceSidebar'

describe('WorkspaceSidebar', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('switches categories and shows the matching empty state', () => {
    render(<WorkspaceSidebar><div>工作区</div></WorkspaceSidebar>)

    expect(screen.getAllByText('暂时还没有 Skill').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Workflows' })[0])
    expect(screen.getAllByText('暂时还没有 Workflow').length).toBeGreaterThan(0)
  })

  it('opens from the shared event without rendering a floating trigger', () => {
    render(<WorkspaceSidebar><div>工作区</div></WorkspaceSidebar>)

    expect(screen.queryByRole('button', { name: '打开扩展侧边栏' })).toBeNull()
    act(() => openWorkspaceSidebar('skills'))
    expect(screen.getByRole('button', { name: '关闭扩展侧边栏' })).toBeTruthy()
  })
})
