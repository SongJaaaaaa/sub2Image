import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAgentVideoApiProfile: vi.fn(),
  normalizeSettings: vi.fn((settings) => settings),
  validateApiProfile: vi.fn(),
  storeImage: vi.fn(),
  genId: vi.fn(),
  getState: vi.fn(),
  putTask: vi.fn(),
  executeVideoTask: vi.fn(),
}))

vi.mock('../../lib/apiProfiles', () => ({
  getAgentVideoApiProfile: mocks.getAgentVideoApiProfile,
  normalizeSettings: mocks.normalizeSettings,
  validateApiProfile: mocks.validateApiProfile,
}))
vi.mock('../../lib/db', () => ({ storeImage: mocks.storeImage }))
vi.mock('../../lib/id', () => ({ genId: mocks.genId }))
vi.mock('../../state/appStore', () => ({ useStore: { getState: mocks.getState } }))
vi.mock('../tasks/taskPersistence', () => ({ putTask: mocks.putTask }))
vi.mock('./videoExecution', () => ({ executeVideoTask: mocks.executeVideoTask }))

import { submitVideoTask } from './videoSubmit'

describe('video task submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.genId.mockImplementation(() => `video-${mocks.genId.mock.calls.length}`)
    mocks.getAgentVideoApiProfile.mockReturnValue({
      id: 'video-profile',
      name: '视频配置',
      baseUrl: '/sub2api-v1',
      apiKey: 'key',
      model: 'grok-imagine-video',
      timeout: 600,
    })
    mocks.validateApiProfile.mockReturnValue(null)
  })

  it('creates up to four independent video tasks', async () => {
    const setTasks = vi.fn()
    const showToast = vi.fn()
    mocks.getState.mockReturnValue({
      settings: {
        sub2Configs: [{ profileId: 'video-profile', platform: 'grok' }],
      },
      tasks: [],
      setTasks,
      showToast,
      setShowSettings: vi.fn(),
    })
    const signal = new AbortController().signal

    await submitVideoTask({
      draft: {
        prompt: '车辆驶过雨夜城市，镜头缓慢推进',
        inputImages: [],
        maskDraft: null,
        params: {
          size: 'auto',
          quality: 'auto',
          output_format: 'png',
          output_compression: null,
          moderation: 'auto',
          n: 1,
          transparent_output: false,
        },
      },
      params: { duration: 12, aspectRatio: '9:16', resolution: '720p', n: 4 },
      signal,
    })

    const tasks = setTasks.mock.calls[0]![0]
    expect(tasks).toHaveLength(4)
    expect(tasks.map((task: { id: string }) => task.id)).toEqual(['video-1', 'video-2', 'video-3', 'video-4'])
    expect(tasks.every((task: { videoParams: { n: number } }) => task.videoParams.n === 1)).toBe(true)
    expect(mocks.putTask).toHaveBeenCalledTimes(4)
    expect(mocks.executeVideoTask).toHaveBeenCalledTimes(4)
    expect(mocks.executeVideoTask).toHaveBeenCalledWith('video-1', signal)
    expect(showToast).toHaveBeenCalledWith('4 个视频任务已提交', 'success')
  })

  it('stores Gemini provider for Veo video tasks', async () => {
    const setTasks = vi.fn()
    mocks.getState.mockReturnValue({
      settings: {
        sub2Configs: [{ profileId: 'video-profile', platform: 'gemini' }],
      },
      tasks: [],
      setTasks,
      showToast: vi.fn(),
      setShowSettings: vi.fn(),
    })
    mocks.getAgentVideoApiProfile.mockReturnValue({
      id: 'video-profile',
      name: '视频配置',
      baseUrl: '/sub2api-v1',
      apiKey: 'key',
      model: 'veo-3.1-generate-preview',
      timeout: 600,
    })

    await submitVideoTask({
      draft: {
        prompt: '海边公路上的红色敞篷车',
        inputImages: [],
        maskDraft: null,
        params: {
          size: 'auto',
          quality: 'auto',
          output_format: 'png',
          output_compression: null,
          moderation: 'auto',
          n: 1,
          transparent_output: false,
        },
      },
      params: { duration: 6, aspectRatio: '16:9', resolution: '720p', n: 1 },
    })

    expect(setTasks.mock.calls[0]![0][0]).toMatchObject({
      videoProvider: 'gemini',
      videoModel: 'veo-3.1-generate-preview',
    })
  })
})
