// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VoiceGeneratorTool from './VoiceGeneratorTool'

const mocks = vi.hoisted(() => ({
  createSpeech: vi.fn(),
  listVoices: vi.fn(),
}))

vi.mock('../../adapters/mediaApi', () => ({
  createMediaSpeech: mocks.createSpeech,
  listMediaVoices: mocks.listVoices,
}))

const voices = [
  { name: 'zh-CN-XiaoxiaoNeural', locale: 'zh-CN', gender: 'Female' as const, displayName: '晓晓' },
  { name: 'zh-CN-YunxiNeural', locale: 'zh-CN', gender: 'Male' as const, displayName: '云希' },
  { name: 'en-US-GuyNeural', locale: 'en-US', gender: 'Male' as const, displayName: 'Guy' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listVoices.mockResolvedValue(voices)
  mocks.createSpeech.mockResolvedValue(new Blob(['mp3'], { type: 'audio/mpeg' }))
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second'),
    revokeObjectURL: vi.fn(),
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('VoiceGeneratorTool', () => {
  it('筛选音色并提交截断后的试听文字和当前参数', async () => {
    render(<VoiceGeneratorTool />)
    await screen.findByText('Guy')

    fireEvent.change(screen.getByLabelText('搜索音色'), { target: { value: 'Guy' } })
    expect(screen.queryByRole('button', { name: /晓晓/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '选择 Guy' }))

    const text = 'a'.repeat(90)
    fireEvent.change(screen.getByLabelText('要朗读的文字'), { target: { value: text } })
    fireEvent.change(screen.getByRole('slider', { name: '语速' }), { target: { value: '25' } })
    fireEvent.change(screen.getByRole('slider', { name: '音调' }), { target: { value: '-10' } })
    fireEvent.change(screen.getByRole('slider', { name: '音量' }), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: '试听前 80 字' }))

    await waitFor(() => expect(mocks.createSpeech).toHaveBeenCalledWith({
      text: 'a'.repeat(80),
      voice: 'en-US-GuyNeural',
      rate: 25,
      pitch: -10,
      volume: 15,
    }, expect.any(AbortSignal)))
  })

  it('新结果和页面卸载时释放 MP3 URL', async () => {
    const view = render(<VoiceGeneratorTool />)
    await screen.findByText('Guy')
    fireEvent.change(screen.getByLabelText('要朗读的文字'), { target: { value: '第一段文字' } })

    fireEvent.click(screen.getByRole('button', { name: '生成 MP3' }))
    await screen.findByRole('link', { name: '下载 MP3' })
    fireEvent.click(screen.getByRole('button', { name: '生成 MP3' }))
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first'))

    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second')
  })

  it('音色加载失败后可以重新获取', async () => {
    mocks.listVoices
      .mockRejectedValueOnce(new Error('Cloud Server 未启动或代理连接失败'))
      .mockResolvedValueOnce(voices)
    render(<VoiceGeneratorTool />)

    await screen.findByText('Cloud Server 未启动或代理连接失败')
    fireEvent.click(screen.getByRole('button', { name: '重新获取' }))

    await screen.findByText('Guy')
    expect(mocks.listVoices).toHaveBeenCalledTimes(2)
  })

  it('点击列表播放按钮时选中音色并使用对应语言试听', async () => {
    render(<VoiceGeneratorTool />)
    await screen.findByText('Guy')
    fireEvent.change(screen.getByLabelText('要朗读的文字'), { target: { value: '输入框里的中文' } })

    fireEvent.click(screen.getByRole('button', { name: 'Guy，点击试听' }))

    await waitFor(() => expect(mocks.createSpeech).toHaveBeenCalledWith({
      text: 'English',
      voice: 'en-US-GuyNeural',
      rate: 0,
      pitch: 0,
      volume: 0,
    }, expect.any(AbortSignal)))
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Guy，停止试听' })).toBeTruthy()
    expect(screen.getByText('Guy · 英语（美国） · en-US')).toBeTruthy()
  })

  it('切换音色后使用当前音色生成新 MP3', async () => {
    render(<VoiceGeneratorTool />)
    await screen.findByText('云希')
    fireEvent.change(screen.getByLabelText('要朗读的文字'), { target: { value: '这是一段中文' } })
    fireEvent.click(screen.getByRole('button', { name: '生成 MP3' }))
    await screen.findByRole('link', { name: '下载 MP3' })

    fireEvent.click(screen.getByRole('button', { name: '选择 云希' }))
    fireEvent.click(screen.getByRole('button', { name: '生成 MP3' }))

    await waitFor(() => expect(mocks.createSpeech).toHaveBeenCalledWith({
      text: '这是一段中文',
      voice: 'zh-CN-YunxiNeural',
      rate: 0,
      pitch: 0,
      volume: 0,
    }, expect.any(AbortSignal)))
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first'))
    expect(screen.getByText('云希 · 中文（中国） · zh-CN')).toBeTruthy()
  })

  it('使用现有下拉组件显示中文语言和地区', async () => {
    render(<VoiceGeneratorTool />)
    await screen.findByText('晓晓 · 中文（中国） · zh-CN')

    fireEvent.click(screen.getByRole('combobox', { name: '语言或地区' }))
    expect(screen.getAllByRole('option')[1].textContent).toContain('中文（中国） · zh-CN')
    fireEvent.click(screen.getByRole('option', { name: '英语（美国） · en-US' }))

    expect(screen.getByRole('combobox', { name: '语言或地区' }).textContent).toContain('英语（美国）')
    expect(screen.getByText('1 个可用音色')).toBeTruthy()
  })
})
