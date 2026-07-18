import type {
  PromptArtifact,
  PromptBriefMergeResult,
  PromptBriefPatchEntry,
  PromptDomainDefinition,
  PromptFieldConflict,
  PromptInterviewReply,
  PromptProject,
  PromptStudioSourceSnapshot,
} from '../types'
import {
  applyPromptConflict,
  createPromptBrief,
  isPromptBriefComplete,
  mergePromptBrief,
} from './brief'
import { assertPromptQuestions } from './questions'
import {
  addPromptVersion,
  buildPromptOptimizationContext,
  type AddPromptVersionOptions,
} from './versions'

export type CreatePromptProjectInput = {
  id: string
  conversationId?: string
  title: string
  source: PromptStudioSourceSnapshot
  domain: PromptDomainDefinition
  now?: number
}

export type PromptProjectMergeResult = Pick<PromptBriefMergeResult, 'conflicts' | 'issues'> & {
  project: PromptProject
  changedFields: string[]
  invalidatedFields: string[]
}

export type ApplyPromptReplyOptions = {
  messageId?: string
  now?: number
}

export function createPromptProject(input: CreatePromptProjectInput): PromptProject {
  const now = input.now ?? Date.now()
  return {
    id: input.id,
    conversationId: input.conversationId,
    domain: input.domain.id,
    title: input.title,
    source: input.source,
    brief: createPromptBrief(input.domain, now),
    messages: [],
    pendingConflicts: [],
    versions: [],
    phase: 'extracting',
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

export function applyPromptInterviewReply(
  project: PromptProject,
  reply: PromptInterviewReply,
  domain: PromptDomainDefinition,
  opts?: ApplyPromptReplyOptions,
): PromptProjectMergeResult {
  return applyPromptReply(project, reply, domain, ['extracting', 'interview'], opts)
}

export function applyPromptOptimizationReply(
  project: PromptProject,
  reply: PromptInterviewReply,
  domain: PromptDomainDefinition,
  opts?: ApplyPromptReplyOptions,
): PromptProjectMergeResult {
  return applyPromptReply(project, reply, domain, ['generating'], opts)
}

function applyPromptReply(
  project: PromptProject,
  reply: PromptInterviewReply,
  domain: PromptDomainDefinition,
  allowed: PromptProject['phase'][],
  opts?: ApplyPromptReplyOptions,
): PromptProjectMergeResult {
  assertProjectDomain(project, domain)
  assertProjectPhase(project, allowed)
  const now = opts?.now ?? Date.now()
  const result = mergePromptBrief(project.brief, reply.briefPatch, domain, now)
  const pending = mergePromptConflicts(project.pendingConflicts, result.conflicts)
  const phase = getInterviewPhase(result, domain, pending)
  assertPromptQuestions(reply.questions, result.brief, domain, phase)

  const msg = {
    id: opts?.messageId ?? `prompt-message-${now}-${project.messages.length + 1}`,
    role: 'assistant' as const,
    content: reply.message,
    questionIds: reply.questions.map((question) => question.id),
    createdAt: now,
  }

  return toProjectMergeResult(project, result, {
    brief: result.brief,
    messages: [...project.messages, msg],
    pendingConflicts: pending,
    phase,
    updatedAt: now,
  }, pending)
}

export function applyPromptProjectPatch(
  project: PromptProject,
  patch: readonly PromptBriefPatchEntry[],
  domain: PromptDomainDefinition,
  now = Date.now(),
): PromptProjectMergeResult {
  assertProjectDomain(project, domain)
  assertProjectPhase(project, ['interview', 'review', 'ready'])
  const result = mergePromptBrief(project.brief, patch, domain, now)
  const pending = mergePromptConflicts(project.pendingConflicts, result.conflicts)

  return toProjectMergeResult(project, result, {
    brief: result.brief,
    pendingConflicts: pending,
    phase: getInterviewPhase(result, domain, pending),
    updatedAt: now,
  }, pending)
}

export function confirmPromptProjectConflict(
  project: PromptProject,
  conflict: PromptFieldConflict,
  domain: PromptDomainDefinition,
  now = Date.now(),
): PromptProjectMergeResult {
  assertProjectDomain(project, domain)
  assertProjectPhase(project, ['interview'])
  const index = project.pendingConflicts.findIndex((item) => samePromptConflict(item, conflict))
  if (index < 0) throw new Error(`待确认冲突不存在或已更新: ${conflict.field}`)
  const result = applyPromptConflict(project.brief, conflict, domain, now)
  const remaining = project.pendingConflicts.filter((_, itemIndex) => itemIndex !== index)
  const pending = mergePromptConflicts(remaining, result.conflicts)

  return toProjectMergeResult(project, result, {
    brief: result.brief,
    pendingConflicts: pending,
    phase: getInterviewPhase(result, domain, pending),
    updatedAt: now,
  }, pending)
}

export function startPromptGeneration(
  project: PromptProject,
  domain: PromptDomainDefinition,
  now = Date.now(),
) {
  assertProjectDomain(project, domain)
  if (project.phase !== 'review') throw new Error('只有需求确认阶段可以生成完整提示词')
  if (project.pendingConflicts.length) throw new Error('仍有字段冲突等待确认')
  if (!isPromptBriefComplete(project.brief, domain)) throw new Error('必需字段尚未完成')
  return { ...project, phase: 'generating' as const, updatedAt: now }
}

export function finishPromptGeneration(
  project: PromptProject,
  artifact: PromptArtifact,
  domain: PromptDomainDefinition,
  opts?: AddPromptVersionOptions,
) {
  assertProjectDomain(project, domain)
  if (project.phase !== 'generating') throw new Error('当前没有正在生成的提示词')
  if (project.pendingConflicts.length) throw new Error('仍有字段冲突等待确认')
  if (!isPromptBriefComplete(project.brief, domain)) throw new Error('必需字段尚未完成，不能进入 ready')
  if (artifact.domain !== project.domain) throw new Error('提示词产物领域与项目不一致')
  if (!artifact.prompt.trim()) throw new Error('提示词产物不能为空')
  return addPromptVersion(project, artifact, 'model', opts)
}

export function saveManualPromptVersion(
  project: PromptProject,
  artifact: PromptArtifact,
  domain: PromptDomainDefinition,
  opts?: AddPromptVersionOptions,
) {
  assertProjectDomain(project, domain)
  if (project.phase !== 'ready') throw new Error('只有已生成的提示词可以保存人工版本')
  if (project.pendingConflicts.length) throw new Error('仍有字段冲突等待确认')
  if (!isPromptBriefComplete(project.brief, domain)) throw new Error('必需字段尚未完成，不能进入 ready')
  if (!artifact.prompt.trim()) throw new Error('提示词产物不能为空')
  if (artifact.domain !== project.domain) throw new Error('提示词产物领域与项目不一致')
  return addPromptVersion(project, artifact, 'user', opts)
}

export function startPromptOptimization(
  project: PromptProject,
  editorPrompt: string,
  instruction: string,
  now = Date.now(),
) {
  if (project.phase !== 'ready') throw new Error('只有已生成的提示词可以继续优化')
  if (project.pendingConflicts.length) throw new Error('仍有字段冲突等待确认')
  if (!editorPrompt.trim()) throw new Error('当前编辑器提示词不能为空')

  return {
    project: { ...project, phase: 'generating' as const, updatedAt: now },
    context: buildPromptOptimizationContext(project, editorPrompt, instruction),
  }
}

export function failPromptGeneration(project: PromptProject, now = Date.now()) {
  if (project.phase !== 'generating') throw new Error('当前没有正在生成的提示词')
  return { ...project, phase: 'error' as const, updatedAt: now }
}

export function retryPromptGeneration(project: PromptProject, now = Date.now()) {
  if (project.phase !== 'error') throw new Error('只有失败状态可以重试')
  return { ...project, phase: 'generating' as const, updatedAt: now }
}

function getInterviewPhase(
  result: PromptBriefMergeResult,
  domain: PromptDomainDefinition,
  pending: readonly PromptFieldConflict[],
): 'interview' | 'review' {
  if (pending.length || result.issues.length) return 'interview'
  return isPromptBriefComplete(result.brief, domain) ? 'review' : 'interview'
}

function toProjectMergeResult(
  project: PromptProject,
  result: PromptBriefMergeResult,
  changes: Partial<PromptProject>,
  pending: PromptFieldConflict[],
): PromptProjectMergeResult {
  return {
    project: { ...project, ...changes },
    changedFields: result.changedFields,
    invalidatedFields: result.invalidatedFields,
    conflicts: pending,
    issues: result.issues,
  }
}

function mergePromptConflicts(
  current: readonly PromptFieldConflict[],
  next: readonly PromptFieldConflict[],
) {
  const conflicts = new Map(current.map((conflict) => [conflict.field, conflict]))
  next.forEach((conflict) => conflicts.set(conflict.field, conflict))
  return [...conflicts.values()]
}

function samePromptConflict(first: PromptFieldConflict, second: PromptFieldConflict) {
  return first.field === second.field
    && first.reason === second.reason
    && first.next.field === second.next.field
    && first.current.status === second.current.status
    && first.current.origin === second.current.origin
    && first.current.locked === second.current.locked
    && first.current.updatedAt === second.current.updatedAt
    && JSON.stringify(first.current.value) === JSON.stringify(second.current.value)
    && first.next.status === second.next.status
    && first.next.origin === second.next.origin
    && first.next.locked === second.next.locked
    && JSON.stringify(first.next.value) === JSON.stringify(second.next.value)
}

function assertProjectDomain(project: PromptProject, domain: PromptDomainDefinition) {
  if (project.domain !== domain.id || project.brief.domain !== domain.id) {
    throw new Error(`项目领域不匹配: ${project.domain}`)
  }
}

function assertProjectPhase(project: PromptProject, allowed: PromptProject['phase'][]) {
  if (!allowed.includes(project.phase)) throw new Error(`当前阶段不允许此操作: ${project.phase}`)
}
