// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  exportData: vi.fn(async (_options?: unknown) => undefined),
  importData: vi.fn(async (_file: File, _options?: unknown) => false),
  clearData: vi.fn(async (_options?: unknown) => undefined),
}))

vi.mock('../../src/store', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/store')>(),
  exportData: mocks.exportData,
  importData: mocks.importData,
  clearData: mocks.clearData,
}))

import ConfirmDialog from '../../src/components/ui/ConfirmDialog'
import SettingsModal from '../../src/features/settings/components/SettingsModal'
import { useStore } from '../../src/store'

const initialState = useStore.getState()

function getPanel(name: string) {
  const panel = screen.getByRole('heading', { name }).parentElement?.parentElement
  if (!panel) throw new Error(`找不到 ${name} 面板`)
  return panel
}

async function renderDataSettings() {
  render(
    <>
      <SettingsModal />
      <ConfirmDialog />
    </>,
  )
  await screen.findByRole('heading', { name: '导出数据' })
}

beforeEach(() => {
  useStore.setState(initialState, true)
  useStore.setState({
    showSettings: true,
    settingsTabRequest: 'data',
    confirmDialog: null,
  })
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  Object.values(mocks).forEach((mock) => mock.mockClear())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Settings data ranges', () => {
  it('includes Prompt Projects by default and passes every selected range', async () => {
    const user = userEvent.setup()
    await renderDataSettings()
    const exportPanel = getPanel('导出数据')
    const importPanel = getPanel('导入数据')
    const clearPanel = getPanel('清除数据')

    expect((within(exportPanel).getByRole('checkbox', { name: '包含提示词项目' }) as HTMLInputElement).checked).toBe(true)
    expect((within(importPanel).getByRole('checkbox', { name: '包含提示词项目' }) as HTMLInputElement).checked).toBe(true)
    expect((within(clearPanel).getByRole('checkbox', { name: '包含提示词项目' }) as HTMLInputElement).checked).toBe(true)

    await user.click(within(exportPanel).getByRole('button', { name: '导出所选数据' }))
    expect(mocks.exportData).toHaveBeenCalledWith({
      exportConfig: true,
      exportTasks: true,
      exportPromptProjects: true,
    })

    const input = importPanel.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['zip'], 'backup.zip', { type: 'application/zip' })] } })
    await waitFor(() => expect(mocks.importData).toHaveBeenCalledWith(expect.any(File), {
      importConfig: true,
      importTasks: true,
      importPromptProjects: true,
    }))

    await user.click(within(clearPanel).getByRole('button', { name: '清空所选数据' }))
    expect(await screen.findByText('确定要清空所选的数据吗？本次包含提示词项目，此操作不可恢复。')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(mocks.clearData).toHaveBeenCalledWith({
      clearConfig: true,
      clearTasks: true,
      clearPromptProjects: true,
    }))
  })

  it('keeps project-only actions enabled and confirms when projects are excluded', async () => {
    const user = userEvent.setup()
    await renderDataSettings()

    for (const name of ['导出数据', '导入数据', '清除数据']) {
      const panel = getPanel(name)
      const queries = within(panel)
      await user.click(queries.getByRole('checkbox', { name: '包含配置' }))
      await user.click(queries.getByRole('checkbox', { name: '包含任务和图片' }))
      const button = queries.getByRole('button') as HTMLButtonElement
      expect(button.disabled).toBe(false)
      await user.click(queries.getByRole('checkbox', { name: '包含提示词项目' }))
      expect(button.disabled).toBe(true)
    }

    const clearPanel = getPanel('清除数据')
    await user.click(within(clearPanel).getByRole('checkbox', { name: '包含配置' }))
    await user.click(within(clearPanel).getByRole('button', { name: '清空所选数据' }))
    expect(await screen.findByText('确定要清空所选的数据吗？本次不包含提示词项目，此操作不可恢复。')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(mocks.clearData).toHaveBeenCalledWith({
      clearConfig: true,
      clearTasks: false,
      clearPromptProjects: false,
    }))
  })
})
