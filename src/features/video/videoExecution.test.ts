import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskRecord } from '../../types'

const mocks = vi.hoisted(() => ({
  getAgentVideoApiProfile: vi.fn(),
  validateApiProfile: vi.fn(),
  getVideoProvider: vi.fn(),
  pollVideoGeneration: vi.fn(),
  runVideoGeneration: vi.fn(),
  storeVideoOutput: vi.fn(),
  updateTaskInStore: vi.fn(),
  getState: vi.fn(),
}))

vi.mock('../../lib/apiProfiles', () => ({
  getAgentVideoApiProfile: mocks.getAgentVideoApiProfile,
  validateApiProfile: mocks.validateApiProfile,
}))

vi.mock('../../videoIntegrations', () => ({
  getVideoProvider: mocks.getVideoProvider,
  pollVideoGeneration: mocks.pollVideoGeneration,
  runVideoGeneration: mocks.runVideoGeneration,
}))

vi.mock('../imageLibrary', () => ({ ensureImageCached: vi.fn() }))
vi.mock('../tasks/taskOutputStorage', () => ({ deleteUnreferencedImageIds: vi.fn() }))
vi.mock('../tasks/taskActions', () => ({ updateTaskInStore: mocks.updateTaskInStore }))
vi.mock('../tasks/taskPersistence', () => ({ putTask: vi.fn() }))
vi.mock('../videoLibrary', () => ({ deleteUnreferencedVideoIds: vi.fn() }))
vi.mock('../../state/appStore', () => ({ useStore: { getState: mocks.getState } }))
vi.mock('./videoStorage', () => ({ storeVideoOutput: mocks.storeVideoOutput }))

import { executeVideoTask } from './videoExecution'

const profile = {
  id: 'video-profile',
  name: 'Agent 视频',
  provider: 'openai' as const,
  baseUrl: '/sub2api-v1',
  apiKey: 'key',
  model: 'grok-imagine-video',
  timeout: 600,
  apiMode: 'images' as const,
  codexCli: false,
  apiProxy: false,
}

const task: TaskRecord = {
  id: 'video-task',
  kind: 'video',
  prompt: '城市夜景',
  params: {
    size: 'auto',
    quality: 'auto',
    output_format: 'png',
    output_compression: null,
    moderation: 'auto',
    n: 1,
    transparent_output: false,
  },
  videoProvider: 'grok',
  videoProfileId: profile.id,
  videoModel: profile.model,
  videoParams: { duration: 6, aspectRatio: '16:9', resolution: '720p', n: 1 },
  videoRemoteId: 'request-1',
  videoPollInterval: 4500,
  inputImageIds: [],
  outputImages: [],
  status: 'running',
  error: null,
  createdAt: 1,
  finishedAt: null,
  elapsed: null,
}

describe('video task execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAgentVideoApiProfile.mockReturnValue(profile)
    mocks.validateApiProfile.mockReturnValue(null)
    mocks.getVideoProvider.mockReturnValue({ id: 'grok' })
    mocks.pollVideoGeneration.mockResolvedValue({ url: 'https://video.example.com/recovered.mp4' })
    mocks.storeVideoOutput.mockResolvedValue({ videoId: 'video-1', posterId: 'poster-1' })
    mocks.getState.mockReturnValue({
      settings: { profiles: [profile] },
      tasks: [task],
      setTasks: vi.fn(),
      showToast: vi.fn(),
    })
  })

  it('continues polling a recovered task instead of submitting it again', async () => {
    await executeVideoTask(task.id)

    expect(mocks.runVideoGeneration).not.toHaveBeenCalled()
    expect(mocks.pollVideoGeneration).toHaveBeenCalledWith(expect.objectContaining({
      job: { remoteId: 'request-1', pollInterval: 4500 },
    }))
    expect(mocks.updateTaskInStore).toHaveBeenCalledWith(task.id, expect.objectContaining({
      status: 'done',
      outputVideoIds: ['video-1'],
    }))
  })
})
