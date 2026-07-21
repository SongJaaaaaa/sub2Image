// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ExtensionWorkspace from '../ExtensionWorkspace'

describe('ExtensionWorkspace', () => {
  beforeEach(() => window.history.replaceState(null, '', '/app/extensions'))
  afterEach(cleanup)

  it('switches between Tools and Skills with pathname navigation', () => {
    render(<ExtensionWorkspace />)

    expect(screen.getByRole('button', { name: '工具' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('heading', { name: '图片工具' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '视频工具' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '打开图片编辑器' })).toBeTruthy()
    expect(screen.getByText('视频剪辑')).toBeTruthy()
    expect(screen.getByRole('button', { name: '打开视频剪辑' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '技能' }))
    expect(window.location.pathname).toBe('/app/extensions/skills')
    expect(screen.getByRole('button', { name: '查看 电商产品图' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看 视频生成提示词' })).toBeTruthy()
  })

  it('shows Skill source and instructions', () => {
    window.history.replaceState(null, '', '/app/extensions/skills/product-photography')
    render(<ExtensionWorkspace />)

    expect(screen.getByRole('heading', { name: '电商产品图' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '查看开源项目' }).getAttribute('href')).toBe('https://github.com/anthropics/skills')
    expect(screen.getByText(/把用户的商品需求转成清晰/)).toBeTruthy()
  })

  it('shows an unknown item state and returns to the list', () => {
    window.history.replaceState(null, '', '/app/extensions/tools/missing')
    render(<ExtensionWorkspace />)

    expect(screen.getByText('未找到该工具')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回工具列表' }))
    expect(window.location.pathname).toBe('/app/extensions/tools')
    expect(screen.getByRole('button', { name: '打开图片编辑器' })).toBeTruthy()
  })

  it('shows the tool name and returns to the tool list from the header', () => {
    window.history.replaceState(null, '', '/app/extensions/tools/image-editor')
    render(<ExtensionWorkspace />)

    expect(screen.getByRole('heading', { name: '图片编辑器' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回上一页' }))
    expect(window.location.pathname).toBe('/app/extensions/tools')
  })

  it('returns to the original app', () => {
    render(<ExtensionWorkspace />)

    fireEvent.click(screen.getAllByRole('button', { name: '返回原应用' })[0])
    expect(window.location.pathname).toBe('/app')
  })
})
