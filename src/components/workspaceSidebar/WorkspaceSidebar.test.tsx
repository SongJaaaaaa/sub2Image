// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import WorkspaceSidebar from './WorkspaceSidebar'

describe('WorkspaceSidebar', () => {
  beforeEach(() => localStorage.clear())

  it('switches categories and shows the matching empty state', () => {
    render(<WorkspaceSidebar appMode="gallery"><div>工作区</div></WorkspaceSidebar>)

    expect(screen.getAllByText('暂时还没有 Skill').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Workflows' })[0])
    expect(screen.getAllByText('暂时还没有 Workflow').length).toBeGreaterThan(0)
  })
})
