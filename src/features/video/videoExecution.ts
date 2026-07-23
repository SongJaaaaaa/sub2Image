import { getAgentVideoApiProfile, validateApiProfile } from '../../lib/apiProfiles'
import { getVideoProvider, pollVideoGeneration, runVideoGeneration, type VideoProfile } from '../../videoIntegrations'
import { ensureImageCached } from '../imageLibrary'
import { deleteUnreferencedImageIds } from '../tasks/taskOutputStorage'
import { updateTaskInStore } from '../tasks/taskActions'
import { putTask } from '../tasks/taskPersistence'
import { deleteUnreferencedVideoIds } from '../videoLibrary'
import { useStore } from '../../state/appStore'
import { storeVideoOutput } from './videoStorage'

function getVideoTaskProfile(taskId: string): VideoProfile | null {
  const { settings, tasks } = useStore.getState()
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return null
  const active = getAgentVideoApiProfile(settings)
  const profile = task.videoProfileId
    ? settings.profiles.find((item) => item.id === task.videoProfileId) ?? null
    : active
  if (!profile || validateApiProfile(profile)) return null
  return {
    id: profile.id,
    name: profile.name,
    provider: task.videoProvider || 'grok',
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: task.videoModel || profile.model,
    timeout: profile.timeout,
  }
}

export async function executeVideoTask(taskId: string, signal?: AbortSignal) {
  const task = useStore.getState().tasks.find((item) => item.id === taskId)
  if (!task || task.kind !== 'video' || !task.videoParams || !task.videoProvider) return
  const profile = getVideoTaskProfile(taskId)
  if (!profile) {
    updateTaskInStore(taskId, {
      status: 'error',
      error: '找不到此视频任务所使用的 API 配置。',
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })
    return
  }

  try {
    const images: string[] = []
    for (const id of task.inputImageIds) {
      const dataUrl = await ensureImageCached(id)
      if (!dataUrl) throw new Error('输入图片已不存在')
      images.push(dataUrl)
      signal?.throwIfAborted()
    }
    const provider = getVideoProvider(task.videoProvider)
    const output = task.videoRemoteId
      ? await pollVideoGeneration({
          provider,
          profile,
          job: { remoteId: task.videoRemoteId, pollInterval: task.videoPollInterval ?? 3000 },
          signal,
        })
      : await runVideoGeneration({
          provider,
          profile,
          input: {
            mode: images.length ? 'image-to-video' : 'text-to-video',
            prompt: task.prompt,
            images,
            params: task.videoParams,
          },
          signal,
          onSubmitted: async (job) => {
            const state = useStore.getState()
            const current = state.tasks.find((item) => item.id === taskId)
            if (!current) return
            const submitted = { ...current, videoRemoteId: job.remoteId, videoPollInterval: job.pollInterval }
            state.setTasks(state.tasks.map((item) => item.id === taskId ? submitted : item))
            await putTask(submitted)
          },
        })
    signal?.throwIfAborted()
    const saved = await storeVideoOutput(output, signal)
    const latest = useStore.getState().tasks.find((item) => item.id === taskId)
    if (!latest || latest.status !== 'running') {
      await deleteUnreferencedVideoIds([saved.videoId])
      await deleteUnreferencedImageIds([saved.posterId])
      return
    }
    updateTaskInStore(taskId, {
      outputImages: [saved.posterId],
      outputVideoIds: [saved.videoId],
      status: 'done',
      error: null,
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })
    useStore.getState().showToast('视频生成完成', 'success')
  } catch (err) {
    const latest = useStore.getState().tasks.find((item) => item.id === taskId)
    if (!latest || latest.status !== 'running') return
    const stopped = signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')
    const rawResponsePayload = err instanceof Error
      ? (err as Error & { rawResponsePayload?: unknown }).rawResponsePayload
      : undefined
    updateTaskInStore(taskId, {
      status: 'error',
      error: stopped ? '已停止生成。' : err instanceof Error ? err.message : String(err),
      ...(typeof rawResponsePayload === 'string'
        ? { rawResponsePayload }
        : {}),
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })
    useStore.getState().showToast(stopped ? '已停止生成' : '视频生成失败', stopped ? 'info' : 'error')
  }
}
