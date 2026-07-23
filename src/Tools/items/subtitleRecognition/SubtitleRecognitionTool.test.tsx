// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SubtitleRecognitionTool from './SubtitleRecognitionTool'

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  getVideo: vi.fn(),
  listVideos: vi.fn(),
  notify: vi.fn(),
  writeText: vi.fn(),
}))

vi.mock('../../adapters/mediaApi', () => ({
  cancelMediaTranscription: mocks.cancel,
  createMediaTranscription: mocks.create,
  getMediaTranscription: mocks.get,
  MediaApiError: class extends Error {},
}))

vi.mock('../../adapters/videoLibrary', () => ({
  getToolVideo: mocks.getVideo,
  listToolVideos: mocks.listVideos,
}))

vi.mock('../../adapters/notifications', () => ({ notifyTool: mocks.notify }))

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mocks.listVideos.mockResolvedValue([])
  mocks.create.mockResolvedValue({ id: 'job-new', status: 'queued' })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.writeText } })
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn().mockReturnValue('blob:video'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SubtitleRecognitionTool', () => {
  it('从本地视频创建带语言参数的任务', async () => {
    render(<SubtitleRecognitionTool />)
    const file = new File(['video'], 'sample.mp4', { type: 'video/mp4' })
    fireEvent.change(screen.getByLabelText('上传本地视频'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('combobox', { name: '识别语言' }))
    fireEvent.click(screen.getByRole('option', { name: '中文' }))
    fireEvent.click(screen.getByRole('button', { name: '开始识别' }))

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(file, 'sample.mp4', 'zh', expect.any(AbortSignal)))
    expect(window.localStorage.getItem('subtitle-recognition-job-id')).toBe('job-new')
  })

  it('恢复任务、编辑字幕并复制修改后的纯文本', async () => {
    window.localStorage.setItem('subtitle-recognition-job-id', 'job-old')
    mocks.get.mockResolvedValue({
      id: 'job-old',
      status: 'succeeded',
      language: 'zh',
      segments: [{ id: 0, start: 0, end: 1.2, text: '原字幕' }],
    })
    render(<SubtitleRecognitionTool />)

    const input = await screen.findByLabelText('第 1 条字幕')
    const srt = screen.getByRole('button', { name: 'SRT：通用字幕格式，适合剪映、Premiere 和多数播放器' })
    const vtt = screen.getByRole('button', { name: 'VTT：网页字幕格式，适合 HTML5 视频和网站播放器' })
    fireEvent.mouseEnter(srt.parentElement as HTMLElement)
    expect(screen.getByText('SRT：通用字幕格式，适合剪映、Premiere 和多数播放器')).toBeTruthy()
    fireEvent.mouseLeave(srt.parentElement as HTMLElement)
    fireEvent.mouseEnter(vtt.parentElement as HTMLElement)
    expect(screen.getByText('VTT：网页字幕格式，适合 HTML5 视频和网站播放器')).toBeTruthy()
    fireEvent.change(input, { target: { value: '修改后的字幕' } })
    fireEvent.click(screen.getByRole('button', { name: '复制' }))

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith('修改后的字幕'))
  })
})
