import type { VideoInput, VideoJob, VideoOutput, VideoProfile, VideoProvider } from './types'
import { VideoApiError } from './shared/errors'
import { waitForVideoPoll } from './shared/polling'

type RunVideoGenerationOptions = {
  provider: VideoProvider
  profile: VideoProfile
  input: VideoInput
  signal?: AbortSignal
  onSubmitted?: (job: VideoJob) => void | Promise<void>
}

type PollVideoGenerationOptions = Omit<RunVideoGenerationOptions, 'input' | 'onSubmitted'> & {
  job: VideoJob
}

export async function pollVideoGeneration({ provider, profile, job, signal }: PollVideoGenerationOptions): Promise<VideoOutput> {
  if (!provider.poll) throw new VideoApiError('当前视频服务不支持恢复查询，请重新提交')
  const startedAt = Date.now()
  const timeout = Math.max(1, profile.timeout) * 1000

  while (true) {
    signal?.throwIfAborted()
    if (Date.now() - startedAt >= timeout) throw new VideoApiError(`视频生成超时：超过 ${profile.timeout} 秒仍未完成`)
    const result = await provider.poll(job, profile, signal)
    if (result.status === 'done') return result.output
    if (result.status === 'failed') throw new VideoApiError(result.error)
    await waitForVideoPoll(job.pollInterval, signal)
  }
}

export async function runVideoGeneration({ provider, profile, input, signal, onSubmitted }: RunVideoGenerationOptions): Promise<VideoOutput> {
  signal?.throwIfAborted()
  const result = await provider.submit(input, profile, signal)
  if ('output' in result) return result.output
  await onSubmitted?.(result.job)
  return pollVideoGeneration({ provider, profile, job: result.job, signal })
}
