// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { removeAgentSkill, restoreAgentSkill } from '../../Skills'
import ExtensionWorkspace from '../ExtensionWorkspace'

const TEST_SKILL_RAW = `---
id: workspace-upload-test
name: 测试上传技能
description: 验证上传流程
version: 1
author: User
source: https://example.com/skill
license: MIT
---
执行用户提供的测试指令。`

describe('ExtensionWorkspace', () => {
  beforeEach(() => window.history.replaceState(null, '', '/app/extensions'))
  afterEach(() => {
    removeAgentSkill('workspace-upload-test')
    vi.restoreAllMocks()
    cleanup()
  })

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

  it('imports a Markdown Skill and opens its details', async () => {
    window.history.replaceState(null, '', '/app/extensions/skills')
    render(<ExtensionWorkspace />)
    const bytes = new TextEncoder().encode(TEST_SKILL_RAW)
    const file = {
      name: 'test-skill.md',
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer,
    } as File

    fireEvent.change(screen.getByLabelText('选择 Markdown Skill 文件'), { target: { files: [file] } })

    expect(await screen.findByRole('heading', { name: '测试上传技能' })).toBeTruthy()
    expect(screen.getByText('用户导入')).toBeTruthy()
    expect(screen.getByRole('button', { name: '删除本地 Skill' })).toBeTruthy()
  })

  it('移出云端 Skill 前确认并在 removing 状态禁用按钮', () => {
    restoreAgentSkill(TEST_SKILL_RAW, 'test-skill.md')
    window.history.replaceState(null, '', '/app/extensions/skills/workspace-upload-test')
    const onRemove = vi.fn().mockResolvedValue(undefined)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const baseCloud = {
      onImported: vi.fn(),
      onSave: vi.fn().mockResolvedValue(undefined),
      onRemove,
    }
    const { rerender } = render(
      <ExtensionWorkspace skillCloud={{ ...baseCloud, skills: { 'workspace-upload-test': 'saved' } }} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '移出云端' }))
    expect(confirm).toHaveBeenCalledWith('确定将 Skill「测试上传技能」移出云端吗？当前浏览器中的 Skill 会保留。')
    expect(onRemove).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '移出云端' }))
    expect(onRemove).toHaveBeenCalledWith('workspace-upload-test')

    rerender(
      <ExtensionWorkspace skillCloud={{ ...baseCloud, skills: { 'workspace-upload-test': 'removing' } }} />,
    )
    expect((screen.getByRole('button', { name: '正在移出' }) as HTMLButtonElement).disabled).toBe(true)
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
