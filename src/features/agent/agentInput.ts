import type { AgentConversation, AgentMessage, AgentRound, ResponsesOutputItem, TaskRecord } from '../../types'
import {
  collectAgentRoundOutputImageSlots,
  getAgentCurrentReferenceId,
  getAgentGeneratedImageReferenceId,
  replaceAgentPromptImageReferencesForApi,
} from '../../lib/agentImageReferences'
import { isRecord } from '../../lib/object'
import { ensureImageCached } from '../imageLibrary'
import { getAgentRoundPath } from './agentRounds'
import { readAgentImageDataUrls } from './agentRuntimeState'

export async function createAgentUserInputItem(conversation: AgentConversation, round: AgentRound, message: AgentMessage, tasks: TaskRecord[]) {
  const imageDataUrls = await readAgentImageDataUrls(round.inputImageIds)
  const rounds = getAgentRoundPath(conversation, round.id)
  const text = replaceAgentPromptImageReferencesForApi(message.content, round, rounds, tasks)
  const referenceText = round.inputImageIds.length > 0
    ? `\n\n<available_refs>${round.inputImageIds.map((_, idx) => `\n  <ref id="${getAgentCurrentReferenceId(round, idx)}" />`).join('')}\n</available_refs>`
    : ''
  return {
    role: 'user',
    content: [
      { type: 'input_text', text: `${text}${referenceText}` },
      ...imageDataUrls.map((dataUrl) => ({ type: 'input_image', image_url: dataUrl })),
    ],
  }
}

export async function createAgentGeneratedImagesInputItem(round: AgentRound, tasks: TaskRecord[]) {
  const contentParts: Array<{ type: string; text?: string; image_url?: string }> = []
  let imageIndex = 0
  for (const taskId of round.outputTaskIds) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) {
      contentParts.push({ type: 'input_text', text: `<removed_ref id="${getAgentGeneratedImageReferenceId(round, imageIndex)}" />` })
      imageIndex += 1
      continue
    }
    for (const imageId of task.outputImages) {
      const dataUrl = await ensureImageCached(imageId)
      if (dataUrl) contentParts.push({ type: 'input_image', image_url: dataUrl })
      const refId = getAgentGeneratedImageReferenceId(round, imageIndex)
      const prompt = truncateAgentReferencePrompt(task.prompt || '')
      const promptAttribute = prompt ? ` prompt="${escapeXmlAttribute(prompt)}"` : ''
      contentParts.push({ type: 'input_text', text: `<ref id="${refId}"${promptAttribute} />` })
      imageIndex += 1
    }
  }
  if (contentParts.length === 0) return null
  return { role: 'user', content: contentParts }
}

export async function createAgentBatchImagesInputItem(round: AgentRound, tasks: TaskRecord[], batchTaskIds: string[]) {
  const contentParts: Array<{ type: string; text?: string; image_url?: string }> = []
  let baseImageIndex = 0
  for (const taskId of round.outputTaskIds) {
    if (batchTaskIds.includes(taskId)) break
    const task = tasks.find((item) => item.id === taskId)
    baseImageIndex += task ? task.outputImages.length : 1
  }
  let imageIndex = baseImageIndex
  for (const taskId of batchTaskIds) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task || task.status !== 'done') continue
    for (const imageId of task.outputImages) {
      const dataUrl = await ensureImageCached(imageId)
      if (dataUrl) contentParts.push({ type: 'input_image', image_url: dataUrl })
      const refId = getAgentGeneratedImageReferenceId(round, imageIndex)
      const prompt = truncateAgentReferencePrompt(task.prompt || '')
      const promptAttribute = prompt ? ` prompt="${escapeXmlAttribute(prompt)}"` : ''
      contentParts.push({ type: 'input_text', text: `<ref id="${refId}"${promptAttribute} />` })
      imageIndex += 1
    }
  }
  if (contentParts.length === 0) return null
  return { role: 'user', content: contentParts }
}

function escapeXmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function truncateAgentReferencePrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, ' ').trim()
  return normalized.length > 1200 ? `${normalized.slice(0, 1200)}...` : normalized
}

function createAgentAssistantFallbackItem(text: string) {
  return { role: 'assistant', content: [{ type: 'output_text', text }] }
}

export function parseResponseOutputFromPayload(rawResponsePayload?: string): ResponsesOutputItem[] | null {
  if (!rawResponsePayload) return null
  try {
    const payload = JSON.parse(rawResponsePayload) as { output?: unknown }
    return Array.isArray(payload.output) ? payload.output as ResponsesOutputItem[] : null
  } catch {
    return null
  }
}

function sanitizeResponseOutputItemForInput(item: ResponsesOutputItem): unknown | null {
  if (item.type === 'web_search_call' || item.type === 'image_generation_call') return null
  if (item.type !== 'message') return item
  const content = (item.content ?? [])
    .map((part) => {
      if (typeof part.text !== 'string') return null
      if (part.type === 'output_text' || part.type === 'text') return { type: 'output_text', text: part.text }
      return null
    })
    .filter((part): part is { type: 'output_text'; text: string } => Boolean(part))
  return content.length > 0 ? { role: 'assistant', content } : null
}

function filterAgentRoundResponseOutputForInput(_round: AgentRound, _tasks: TaskRecord[], output: ResponsesOutputItem[]) {
  return output
}

export function sanitizeResponseOutputForInput(output: ResponsesOutputItem[], options: { allowPendingFunctionCalls?: boolean } = {}) {
  const items = output.map(sanitizeResponseOutputItemForInput).filter((item): item is unknown => item != null)
  if (options.allowPendingFunctionCalls) return items

  const functionCallIds = new Set<string>()
  const functionOutputCallIds = new Set<string>()
  for (const item of items) {
    if (!isRecord(item)) continue
    const callId = typeof item.call_id === 'string' ? item.call_id : ''
    if (!callId) continue
    if (item.type === 'function_call') functionCallIds.add(callId)
    if (item.type === 'function_call_output') functionOutputCallIds.add(callId)
  }

  return items.filter((item) => {
    if (!isRecord(item)) return true
    const callId = typeof item.call_id === 'string' ? item.call_id : ''
    if (item.type === 'function_call') return callId && functionOutputCallIds.has(callId)
    if (item.type === 'function_call_output') return callId && functionCallIds.has(callId)
    return true
  })
}

export function mergeResponseOutputItems(previous: ResponsesOutputItem[], next: ResponsesOutputItem[]) {
  const merged = [...previous]
  for (const item of next) {
    const idx = item.id ? merged.findIndex((existing) => existing.id === item.id) : -1
    if (idx >= 0) merged[idx] = item
    else merged.push(item)
  }
  return merged
}

export function countResponseToolCalls(output: ResponsesOutputItem[]) {
  return output.filter((item) => item.type === 'image_generation_call').length
}

function createAgentContinuationInputItem(newImageRefs: string[], toolCallsUsed: number, maxToolCalls: number) {
  const lines = ['[System] The app has saved your generated outputs and is continuing the same Agent turn.']
  if (newImageRefs.length > 0) {
    lines.push(`The following image ref ids are now available for you to reference in subsequent image_generation prompts: ${newImageRefs.join(', ')}`)
  }
  lines.push(
    'Continue generating. Do NOT repeat what you already said in earlier responses.',
    'If you still need another round after this (e.g. more dependent images), call continue_generation.',
    `Tool-call budget: ${toolCallsUsed}/${maxToolCalls} used.`,
  )
  return { role: 'user', content: [{ type: 'input_text', text: lines.join('\n') }] }
}

export function buildAgentContinuationInput(baseInput: unknown[], round: AgentRound, tasks: TaskRecord[], currentRoundOutput: ResponsesOutputItem[], toolCallsUsed: number, maxToolCalls: number) {
  const input = [...baseInput, ...sanitizeResponseOutputForInput(currentRoundOutput, { allowPendingFunctionCalls: true })]
  const newImageRefs = collectAgentRoundOutputImageSlots(round, tasks)
    .map((imageId, idx) => imageId ? `<ref id="${getAgentGeneratedImageReferenceId(round, idx)}" />` : null)
    .filter((ref): ref is string => Boolean(ref))
  input.push(createAgentContinuationInputItem(newImageRefs, toolCallsUsed, maxToolCalls))
  return input
}

export function getAgentRoundResponseOutput(round: AgentRound, tasks: TaskRecord[]) {
  if (round.responseOutput?.length) return round.responseOutput
  for (const taskId of round.outputTaskIds) {
    const task = tasks.find((item) => item.id === taskId)
    const output = parseResponseOutputFromPayload(task?.rawResponsePayload)
    if (output?.length) return output
  }
  return null
}

export async function buildAgentApiInput(conversation: AgentConversation, currentRound: AgentRound, tasks: TaskRecord[]) {
  const input: unknown[] = []
  const rounds = getAgentRoundPath(conversation, currentRound.id)
  for (const round of rounds) {
    const userMessage = conversation.messages.find((message) => message.id === round.userMessageId)
    if (!userMessage) continue
    input.push(await createAgentUserInputItem(conversation, round, userMessage, tasks))
    if (round.id === currentRound.id) continue

    const output = getAgentRoundResponseOutput(round, tasks)
    if (output?.length) {
      const sanitizedOutput = sanitizeResponseOutputForInput(filterAgentRoundResponseOutputForInput(round, tasks, output))
      if (sanitizedOutput.length > 0) {
        input.push(...sanitizedOutput)
      } else {
        const assistantMessage = round.assistantMessageId
          ? conversation.messages.find((message) => message.id === round.assistantMessageId)
          : null
        input.push(createAgentAssistantFallbackItem(assistantMessage?.content || '图像已生成。'))
      }
    } else {
      const assistantMessage = round.assistantMessageId
        ? conversation.messages.find((message) => message.id === round.assistantMessageId)
        : null
      input.push(createAgentAssistantFallbackItem(assistantMessage?.content || '[No text response]'))
    }

    if (round.outputTaskIds.length > 0) {
      const imagesItem = await createAgentGeneratedImagesInputItem(round, tasks)
      if (imagesItem) input.push(imagesItem)
    }
  }
  return input
}
