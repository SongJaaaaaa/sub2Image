import type { ComposerDraft, InputImage, MaskDraft, TaskRecord } from '../../types'
import { getActiveApiProfile, normalizeSettings } from '../../lib/apiProfiles'
import { deleteTask } from '../../lib/db'
import { genId } from '../../lib/id'
import { addTaskImageReferences } from '../../lib/imageReferences'
import { remapImageMentionsForOrder } from '../../lib/promptImageMentions'
import { normalizeParamsForSettings } from '../../lib/paramCompatibility'
import { createTransparentOutputMeta, getTransparentRequestParams } from '../../lib/transparentImage'
import { ensureImageCached } from '../imageLibrary'
import { useStore } from '../../state/appStore'
import { deleteUnreferencedImageIds } from './taskOutputStorage'
import { addTaskVideoReferences, deleteUnreferencedVideoIds } from '../videoLibrary'
import { putTask } from './taskPersistence'
import { createSettingsForApiProfile, getTaskApiProfile, getTaskApiProfileName } from './taskProfiles'
import { taskHasOutputErrors, taskMatchesFilterStatus } from './taskSelectors'

type ScrubDeletedTasks = (deletedTasks: TaskRecord[], remainingTasks: TaskRecord[]) => Promise<TaskRecord[]>

export async function retryTask(task: TaskRecord, executeTask: (taskId: string) => void | Promise<void>) {
  const { settings } = useStore.getState()
  const activeProfile = getActiveApiProfile(settings)
  const normalizedParams = normalizeParamsForSettings(task.params, settings, { hasInputImages: task.inputImageIds.length > 0 })
  const shouldUseTransparentOutput = normalizedParams.output_format === 'png' && normalizedParams.transparent_output
  const taskParams = shouldUseTransparentOutput
    ? getTransparentRequestParams(normalizedParams)
    : { ...normalizedParams, transparent_output: false }
  const transparentMeta = taskParams.transparent_output
    ? createTransparentOutputMeta(task.prompt.trim())
    : null
  const taskId = genId()
  const newTask: TaskRecord = {
    id: taskId,
    prompt: task.prompt,
    params: taskParams,
    apiProvider: activeProfile.provider,
    apiProfileId: activeProfile.id,
    apiProfileName: activeProfile.name,
    apiMode: activeProfile.apiMode,
    apiModel: activeProfile.model,
    inputImageIds: [...task.inputImageIds],
    maskTargetImageId: task.maskTargetImageId ?? null,
    maskImageId: task.maskImageId ?? null,
    transparentOutput: transparentMeta?.transparentOutput,
    transparentPrompt: transparentMeta?.effectivePrompt,
    outputImages: [],
    status: 'running',
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
  }

  useStore.getState().setTasks([newTask, ...useStore.getState().tasks])
  await putTask(newTask)
  void executeTask(taskId)
}

let reuseConfigSeq = 0

export async function reuseConfig(
  task: TaskRecord,
  applyComposerDraft: (draft: ComposerDraft) => void,
  submitTask: (options: { useCurrentApiProfileWhenReusedMissing?: boolean }) => void | Promise<void>,
) {
  const seq = ++reuseConfigSeq
  const start = useStore.getState()
  const { settings, showToast, setConfirmDialog, setReusedTaskApiProfile } = start
  const normalizedSettings = normalizeSettings(settings)
  const currentProfile = getActiveApiProfile(settings)
  const matchedProfile = normalizedSettings.reuseTaskApiProfileTemporarily ? getTaskApiProfile(normalizedSettings, task) : null
  const shouldTemporarilyReuseProfile = Boolean(matchedProfile && matchedProfile.id !== currentProfile.id)
  const missingReusedProfile = normalizedSettings.reuseTaskApiProfileTemporarily && !matchedProfile
  const taskProfileName = matchedProfile?.name ?? getTaskApiProfileName(task)
  const paramsSettings = shouldTemporarilyReuseProfile && matchedProfile ? createSettingsForApiProfile(normalizedSettings, matchedProfile) : normalizedSettings
  const params = normalizeParamsForSettings(task.params, paramsSettings, { hasInputImages: task.inputImageIds.length > 0 })

  const imgs: InputImage[] = []
  for (const id of task.inputImageIds) {
    const dataUrl = await ensureImageCached(id)
    if (dataUrl) imgs.push({ id, dataUrl })
  }
  const maskTargetImageId = task.maskTargetImageId ?? (task.maskImageId ? task.inputImageIds[0] : null)
  let maskDraft: MaskDraft | null = null
  if (maskTargetImageId && task.maskImageId && imgs.some((img) => img.id === maskTargetImageId)) {
    const maskDataUrl = await ensureImageCached(task.maskImageId)
    if (maskDataUrl) maskDraft = { targetImageId: maskTargetImageId, maskDataUrl, updatedAt: Date.now() }
  }
  const current = useStore.getState()
  if (
    seq !== reuseConfigSeq ||
    current.appMode !== start.appMode ||
    current.activeAgentConversationId !== start.activeAgentConversationId ||
    current.settings !== start.settings ||
    current.prompt !== start.prompt ||
    current.inputImages !== start.inputImages ||
    current.maskDraft !== start.maskDraft ||
    current.params !== start.params
  ) return

  const sourceImages = task.inputImageIds.map((id) => ({ id, dataUrl: '' }))
  const prompt = remapImageMentionsForOrder(task.prompt, sourceImages, imgs)
  setReusedTaskApiProfile(
    shouldTemporarilyReuseProfile && matchedProfile ? matchedProfile.id : null,
    missingReusedProfile,
    taskProfileName,
  )
  applyComposerDraft({ prompt, inputImages: imgs, maskDraft, params })
  if (missingReusedProfile) {
    setConfirmDialog({
      title: '找不到 API 配置',
      message: `找不到复用任务所使用的 API 配置「${taskProfileName}」，要使用当前的 API 配置「${currentProfile.name}」提交任务吗？`,
      confirmText: '使用当前配置提交',
      cancelText: '放弃提交',
      action: () => {
        void submitTask({ useCurrentApiProfileWhenReusedMissing: true })
      },
    })
    return
  }

  showToast(
    shouldTemporarilyReuseProfile && matchedProfile
      ? `已临时复用该任务的 API 配置「${matchedProfile.name}」`
      : '已复用配置到输入框',
    'success',
  )
}

export async function editOutputs(task: TaskRecord) {
  const { inputImages, addInputImage, showToast } = useStore.getState()
  if (!task.outputImages?.length) return
  let added = 0
  for (const id of task.outputImages) {
    if (inputImages.find((img) => img.id === id)) continue
    const dataUrl = await ensureImageCached(id)
    if (!dataUrl) continue
    addInputImage({ id, dataUrl })
    added++
  }
  showToast(`已添加 ${added} 张输出图到输入`, 'success')
}

export async function removeMultipleTasks(taskIds: string[], scrubDeletedTasks: ScrubDeletedTasks) {
  const { tasks, setTasks, showToast, selectedTaskIds } = useStore.getState()
  if (!taskIds.length) return
  const ids = new Set(taskIds)
  const deletedTasks = tasks.filter((task) => ids.has(task.id))
  const remaining = await scrubDeletedTasks(deletedTasks, tasks.filter((task) => !ids.has(task.id)))
  const deletedImageIds = new Set<string>()
  const deletedVideoIds = new Set<string>()
  for (const task of deletedTasks) addTaskImageReferences(deletedImageIds, task)
  for (const task of deletedTasks) addTaskVideoReferences(deletedVideoIds, task)

  setTasks(remaining)
  for (const id of taskIds) await deleteTask(id)
  await deleteUnreferencedImageIds(deletedImageIds)
  await deleteUnreferencedVideoIds(deletedVideoIds)

  const nextSelection = selectedTaskIds.filter((id) => !ids.has(id))
  if (nextSelection.length !== selectedTaskIds.length) useStore.getState().setSelectedTaskIds(nextSelection)
  showToast(`已删除 ${taskIds.length} 个任务`, 'success')
}

export async function clearFailedTasks(taskIds: string[] | undefined, removeTasks: (taskIds: string[]) => Promise<void>) {
  const targetIds = taskIds ? new Set(taskIds) : null
  const failedTasks = useStore.getState().tasks
    .filter((task) => taskMatchesFilterStatus(task, 'error') && (!targetIds || targetIds.has(task.id)))
  const failedTaskIds = failedTasks.filter((task) => task.status === 'error').map((task) => task.id)
  const partialFailedTaskIds = new Set(
    failedTasks.filter((task) => task.status !== 'error' && taskHasOutputErrors(task)).map((task) => task.id),
  )

  if (failedTaskIds.length) await removeTasks(failedTaskIds)
  if (!partialFailedTaskIds.size) return
  const { tasks, setTasks, selectedTaskIds, setSelectedTaskIds, showToast } = useStore.getState()
  const updated = tasks.map((task) => partialFailedTaskIds.has(task.id) ? { ...task, outputErrors: undefined } : task)
  setTasks(updated)
  const nextSelectedTaskIds = selectedTaskIds.filter((id) => !partialFailedTaskIds.has(id))
  if (nextSelectedTaskIds.length !== selectedTaskIds.length) setSelectedTaskIds(nextSelectedTaskIds)
  await Promise.all(updated.filter((task) => partialFailedTaskIds.has(task.id)).map((task) => putTask(task)))
  showToast(`已清除 ${partialFailedTaskIds.size} 条部分失败记录`, 'success')
}

export async function removeTask(task: TaskRecord, scrubDeletedTasks: ScrubDeletedTasks) {
  const { tasks, setTasks, showToast } = useStore.getState()
  const imageIds = new Set<string>()
  const videoIds = new Set<string>()
  addTaskImageReferences(imageIds, task)
  addTaskVideoReferences(videoIds, task)
  const remaining = await scrubDeletedTasks([task], tasks.filter((item) => item.id !== task.id))
  setTasks(remaining)
  await deleteTask(task.id)
  await deleteUnreferencedImageIds(imageIds)
  await deleteUnreferencedVideoIds(videoIds)
  showToast('任务已删除', 'success')
}
