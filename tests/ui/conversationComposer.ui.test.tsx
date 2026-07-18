// @vitest-environment jsdom

import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addImageFromFile: vi.fn(async () => undefined),
  submitAgentMessage: vi.fn(async (_options?: { signal?: AbortSignal; draft?: unknown; conversationId?: string; editingRoundId?: string | null }) => undefined),
  submitTask: vi.fn(async (_options?: { signal?: AbortSignal; draft?: unknown }) => undefined),
  stopAgentResponse: vi.fn(),
}))

vi.mock('../../src/store', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/store')>(),
  addImageFromFile: mocks.addImageFromFile,
  submitAgentMessage: mocks.submitAgentMessage,
  submitTask: mocks.submitTask,
  stopAgentResponse: mocks.stopAgentResponse,
}))

import { ConversationAttachments, ConversationComposer } from '../../src/features/conversationComposer'
import Sub2ImageConversationComposer from '../../src/integrations/conversation/Sub2ImageConversationComposer'
import { clearActiveComposerOwner, NEXT_COMPOSER_OWNER, isComposerFocused } from '../../src/integrations/conversation/composerFocus'
import { getActiveApiProfile } from '../../src/lib/apiProfiles'
import { getSelectedImageMentionLabel } from '../../src/lib/promptImageMentions'
import { useStore } from '../../src/store'

const initialState = useStore.getState()
const elementFromPoint = document.elementFromPoint?.bind(document)
Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: () => new DOMRect(),
})

function ComposerFixture({ enterSubmit = true, onSubmit = vi.fn() }: { enterSubmit?: boolean; onSubmit?: () => void }) {
  const [value, setValue] = useState('')
  return (
    <ConversationComposer
      ownerId="fixture"
      value={value}
      placeholder="输入内容"
      editorAriaLabel="测试编辑器"
      enterSubmit={enterSubmit}
      canSubmit={Boolean(value)}
      onChange={setValue}
      onSubmit={onSubmit}
    />
  )
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  useStore.setState(initialState, true)
  const state = useStore.getState()
  const profile = { ...state.settings.profiles[0]!, id: 'test-profile', apiKey: 'test-key' }
  useStore.setState({
    settings: {
      ...state.settings,
      profiles: [profile],
      activeProfileId: profile.id,
      apiKey: 'test-key',
      reuseTaskApiProfileTemporarily: false,
    },
  })
  clearActiveComposerOwner(NEXT_COMPOSER_OWNER)
  Object.values(mocks).forEach((mock) => mock.mockClear())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint })
})

describe('ConversationComposer', () => {
  it('does not submit Enter during IME composition', async () => {
    const onSubmit = vi.fn()
    render(<ComposerFixture onSubmit={onSubmit} />)
    const editor = screen.getByRole('textbox', { name: '测试编辑器' })
    await userEvent.click(editor)
    await userEvent.type(editor, '中文')

    fireEvent.compositionStart(editor)
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true })
    fireEvent.compositionEnd(editor)

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps existing Enter and modifier submit behavior', async () => {
    const enterSubmit = vi.fn()
    const user = userEvent.setup()
    const first = render(<ComposerFixture onSubmit={enterSubmit} />)
    const firstEditor = screen.getByRole('textbox', { name: '测试编辑器' })
    await user.click(firstEditor)
    await user.type(firstEditor, '内容')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(firstEditor.textContent).toContain('\n')
    expect(enterSubmit).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(enterSubmit).toHaveBeenCalledOnce()

    first.unmount()
    const modifierSubmit = vi.fn()
    render(<ComposerFixture enterSubmit={false} onSubmit={modifierSubmit} />)
    const secondEditor = screen.getByRole('textbox', { name: '测试编辑器' })
    await user.click(secondEditor)
    await user.type(secondEditor, '内容')
    await user.keyboard('{Enter}')
    expect(modifierSubmit).not.toHaveBeenCalled()
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(modifierSubmit).toHaveBeenCalledOnce()
  })

  it('does not remount or blur the editor when Tool controls change', () => {
    const { rerender } = render(
      <ConversationComposer
        ownerId="fixture"
        value="保持内容"
        placeholder="输入内容"
        editorAriaLabel="测试编辑器"
        enterSubmit
        canSubmit
        toolSlot={<span>Tool A</span>}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    )
    const editor = screen.getByRole('textbox', { name: '测试编辑器' })
    editor.focus()

    rerender(
      <ConversationComposer
        ownerId="fixture"
        value="保持内容"
        placeholder="输入内容"
        editorAriaLabel="测试编辑器"
        enterSubmit
        canSubmit
        toolSlot={<span>Tool B</span>}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    )

    expect(screen.getByRole('textbox', { name: '测试编辑器' })).toBe(editor)
    expect(document.activeElement).toBe(editor)
    expect(editor.textContent).toBe('保持内容')
  })

  it('routes attachment preview, remove and ordering once', async () => {
    const onPreview = vi.fn()
    const onMove = vi.fn()
    const onRemove = vi.fn()
    render(
      <ConversationAttachments
        items={[
          { id: 'image-1', label: '参考图1', previewUrl: 'data:image/png;base64,a' },
          { id: 'image-2', label: '参考图2', previewUrl: 'data:image/png;base64,b' },
        ]}
        onPreview={onPreview}
        onMove={onMove}
        onRemove={onRemove}
      />,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '预览参考图1' }))
    await user.click(screen.getByRole('button', { name: '移除参考图1' }))

    expect(onPreview).toHaveBeenCalledWith('image-1', 0)
    expect(onRemove).toHaveBeenCalledOnce()
    const first = document.querySelector<HTMLElement>('[data-composer-attachment-index="0"]')!
    const second = document.querySelector<HTMLElement>('[data-composer-attachment-index="1"]')!
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => second })
    fireEvent.touchStart(first, { touches: [{ clientX: 10, clientY: 10 }] })
    fireEvent.touchMove(first, { touches: [{ clientX: 50, clientY: 10 }] })
    fireEvent.touchEnd(first)
    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove).toHaveBeenCalledWith(0, 2)

    onMove.mockClear()
    fireEvent.touchStart(first, { touches: [{ clientX: 10, clientY: 10 }] })
    fireEvent.touchMove(first, { touches: [{ clientX: 50, clientY: 10 }] })
    fireEvent.touchCancel(first)
    expect(onMove).not.toHaveBeenCalled()
  })
})

describe('Sub2ImageConversationComposer', () => {
  it('reads and writes the shared draft, attachments and params', async () => {
    render(<Sub2ImageConversationComposer />)
    const editor = screen.getByRole('textbox', { name: '图片提示词输入' })
    const user = userEvent.setup()

    await user.click(editor)
    await user.type(editor, '共享草稿')
    expect(useStore.getState().prompt).toBe('共享草稿')

    act(() => {
      useStore.getState().setPrompt('旧输入框更新')
      useStore.getState().addInputImage({ id: 'image-1', dataUrl: 'data:image/png;base64,a' })
      useStore.getState().setParams({ quality: 'high' })
    })

    await waitFor(() => expect(editor.textContent).toBe('旧输入框更新'))
    expect(screen.getByRole('button', { name: '预览参考图1' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '图片设置' }))
    expect(screen.getByRole('button', { name: '高' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '横向 16:9' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '生成数量' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '低质量生成最快、费用最低；高质量细节更多，但更慢、费用更高。' })).toBeTruthy()
  })

  it('selects Prompt Agent first and waits for send before opening questions', async () => {
    useStore.getState().setPrompt('先选择再发送')
    render(<Sub2ImageConversationComposer />)
    const user = userEvent.setup()
    const agent = document.querySelector<HTMLButtonElement>('.cc-agent-button')!

    expect(document.querySelector('[data-conversation-composer-dock] [title="提示词库"]')).toBeNull()
    await user.click(agent)

    // 选中后 Agent 按钮会切换为液态样式的新元素，需要重新查询
    const agentSelected = document.querySelector<HTMLButtonElement>('.cc-agent-button')!
    expect(agentSelected.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('textbox', { name: '图片提示词输入' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '发送到图片提示词 Agent' })).toBeTruthy()
    expect(document.querySelector('[data-prompt-agent-card]')).toBeNull()
    expect(mocks.submitTask).not.toHaveBeenCalled()
  })

  it('uses a temporary settings draft and only commits on save', async () => {
    render(<Sub2ImageConversationComposer />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '图片设置' }))
    await user.click(screen.getByRole('button', { name: '高' }))
    await user.click(screen.getByRole('button', { name: '关闭设置' }))
    expect(useStore.getState().params.quality).toBe('auto')
    expect(screen.getByRole('textbox', { name: '图片提示词输入' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '图片设置' }))
    await user.click(screen.getByRole('button', { name: '高' }))
    await user.click(screen.getByRole('button', { name: 'JPEG' }))
    await user.click(screen.getByRole('button', { name: '横向 16:9' }))
    await user.click(screen.getByRole('button', { name: '2K' }))
    await user.click(screen.getByRole('combobox', { name: '生成数量' }))
    await user.click(screen.getByRole('option', { name: '2 张' }))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(useStore.getState().params).toMatchObject({
      size: '2560x1440',
      quality: 'high',
      output_format: 'jpeg',
      n: 2,
    })
  })

  it('keeps thumbnails at 40px and opens mask actions through preview', async () => {
    useStore.getState().addInputImage({ id: 'image-1', dataUrl: 'data:image/png;base64,a' })
    render(<Sub2ImageConversationComposer />)
    const user = userEvent.setup()
    const attachment = document.querySelector<HTMLElement>('.cc-attachment')!
    const composer = document.querySelector<HTMLElement>('.cc-composer')!

    expect(getComputedStyle(attachment).width).toBe('40px')
    expect(getComputedStyle(attachment).height).toBe('40px')
    expect(getComputedStyle(composer).maxHeight).toContain('400px')
    expect(screen.queryByRole('button', { name: '编辑参考图1' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '预览参考图1' }))
    await user.click(screen.getByRole('button', { name: '编辑遮罩' }))
    expect(useStore.getState().maskEditorImageId).toBe('image-1')
  })

  it('submits exactly once and only ingests a focused paste once', async () => {
    useStore.getState().setPrompt('单次提交')
    render(<Sub2ImageConversationComposer />)
    const editor = screen.getByRole('textbox', { name: '图片提示词输入' })
    const user = userEvent.setup()

    expect(getActiveApiProfile(useStore.getState().settings).apiKey).toBe('test-key')
    await user.click(screen.getByRole('button', { name: '生成图片' }))
    expect(useStore.getState().showSettings).toBe(false)
    expect(mocks.submitTask).toHaveBeenCalledOnce()
    expect(mocks.submitAgentMessage).not.toHaveBeenCalled()

    editor.focus()
    expect(isComposerFocused(NEXT_COMPOSER_OWNER)).toBe(true)
    const file = new File(['image'], 'paste.png', { type: 'image/png' })
    fireEvent.paste(editor, {
      clipboardData: {
        items: [{ type: 'image/png', getAsFile: () => file }],
        getData: () => '',
      },
    })

    await waitFor(() => expect(mocks.addImageFromFile).toHaveBeenCalledOnce())
  })

  it('routes Agent through the Chat Tool once', async () => {
    const state = useStore.getState()
    const profile = { ...getActiveApiProfile(state.settings), apiMode: 'responses' as const }
    useStore.setState({
      settings: {
        ...state.settings,
        profiles: [profile],
        activeProfileId: profile.id,
        apiMode: 'responses',
        agentApiConfigMode: 'off',
      },
      appMode: 'agent',
    })
    render(<Sub2ImageConversationComposer />)
    const user = userEvent.setup()

    act(() => useStore.getState().setPrompt('Agent 单次提交'))
    await user.click(screen.getByRole('button', { name: '发送 Agent 消息' }))

    expect(mocks.submitAgentMessage).toHaveBeenCalledOnce()
    expect(mocks.submitTask).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Agent' })).toBeNull()
  })

  it('stops the Image Tool without invoking Agent stop', async () => {
    let signal: AbortSignal | undefined
    mocks.submitTask.mockImplementationOnce(async (options) => {
      signal = options?.signal
      await new Promise<void>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal?.reason), { once: true })
      })
    })
    useStore.getState().setPrompt('停止图片请求')
    render(<Sub2ImageConversationComposer />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '生成图片' }))
    const stop = await screen.findByRole('button', { name: '停止' })
    await user.click(stop)

    expect(signal?.aborted).toBe(true)
    expect(mocks.stopAgentResponse).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: '生成图片' })).toBeTruthy())
  })

  it('scopes Agent running state by conversation and stops legacy work', async () => {
    const state = useStore.getState()
    const profile = { ...getActiveApiProfile(state.settings), apiMode: 'responses' as const }
    const running = {
      id: 'conversation-running',
      title: '运行中',
      createdAt: 1,
      updatedAt: 1,
      rounds: [{
        id: 'round-1',
        index: 1,
        userMessageId: 'message-1',
        prompt: '处理中',
        inputImageIds: [],
        outputTaskIds: [],
        status: 'running' as const,
        error: null,
        createdAt: 1,
        finishedAt: null,
      }],
      messages: [],
    }
    const idle = { ...running, id: 'conversation-idle', title: '空闲', rounds: [] }
    useStore.setState({
      appMode: 'agent',
      settings: {
        ...state.settings,
        profiles: [profile],
        activeProfileId: profile.id,
        apiMode: 'responses',
        agentApiConfigMode: 'off',
      },
      agentConversations: [running, idle],
      activeAgentConversationId: idle.id,
      prompt: '空闲会话消息',
    })
    render(<Sub2ImageConversationComposer />)

    expect(screen.getByRole('button', { name: '发送 Agent 消息' })).toBeTruthy()
    act(() => useStore.getState().setActiveAgentConversationId(running.id))
    const stop = await screen.findByRole('button', { name: '停止' })
    await userEvent.click(stop)

    expect(mocks.stopAgentResponse).toHaveBeenCalledWith(running.id)
  })

  it('selects a current image mention without losing its stable marker', async () => {
    useStore.getState().addInputImage({ id: 'image-1', dataUrl: 'data:image/png;base64,a' })
    render(<Sub2ImageConversationComposer />)
    const editor = screen.getByRole('textbox', { name: '图片提示词输入' })
    const user = userEvent.setup()

    await user.click(editor)
    await user.type(editor, '@')
    await user.click(await screen.findByRole('button', { name: '选择 @图1' }))

    expect(useStore.getState().prompt).toBe(getSelectedImageMentionLabel(0))
    expect(editor.querySelector('.cc-atom')?.textContent).toBe('@图1')
  })

  it('does not select the mention menu while IME is composing', async () => {
    useStore.getState().addInputImage({ id: 'image-1', dataUrl: 'data:image/png;base64,a' })
    render(<Sub2ImageConversationComposer />)
    const editor = screen.getByRole('textbox', { name: '图片提示词输入' })
    const user = userEvent.setup()

    await user.click(editor)
    await user.type(editor, '@')
    await screen.findByRole('button', { name: '选择 @图1' })
    fireEvent.compositionStart(editor)
    fireEvent.keyDown(editor, { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true })

    expect(useStore.getState().prompt).toBe('@')
    expect(editor.querySelector('.cc-atom')).toBeNull()
  })

  it('routes image paste and page drop to the single focused Composer', async () => {
    render(<Sub2ImageConversationComposer />)
    const editor = screen.getByRole('textbox', { name: '图片提示词输入' })
    const file = new File(['image'], 'owner.png', { type: 'image/png' })
    const clipboardData = {
      items: [{ type: 'image/png', getAsFile: () => file }],
      getData: () => '',
    }
    const dropData = {
      files: [file],
      items: [],
      types: ['Files'],
      getData: () => '',
    }

    editor.focus()
    fireEvent.paste(editor, { clipboardData })
    await waitFor(() => expect(mocks.addImageFromFile).toHaveBeenCalledOnce())
    mocks.addImageFromFile.mockClear()
    expect(isComposerFocused(NEXT_COMPOSER_OWNER)).toBe(true)
    fireEvent.drop(document.body, { dataTransfer: dropData })
    await waitFor(() => expect(mocks.addImageFromFile).toHaveBeenCalledOnce())
  })
})
