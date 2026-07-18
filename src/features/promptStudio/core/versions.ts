import type { PromptArtifact, PromptProject, PromptVersion } from '../types'

export type AddPromptVersionOptions = {
  id?: string
  instruction?: string
  now?: number
}

export type PromptOptimizationContext = {
  brief: PromptProject['brief']
  prompt: string
  instruction: string
  lockedFields: string[]
  activeVersion?: PromptVersion
}

export function addPromptVersion(
  project: PromptProject,
  artifact: PromptArtifact,
  source: PromptVersion['source'],
  opts?: AddPromptVersionOptions,
): PromptProject {
  const now = opts?.now ?? Date.now()
  const id = opts?.id ?? `prompt-version-${now}-${project.versions.length + 1}`
  const version: PromptVersion = {
    id,
    artifact: {
      ...artifact,
      params: { ...artifact.params },
      shotList: artifact.shotList?.map((shot) => ({ ...shot })),
    },
    source,
    instruction: opts?.instruction,
    createdAt: now,
  }

  return {
    ...project,
    versions: [...project.versions, version],
    activeVersionId: id,
    phase: 'ready',
    updatedAt: now,
  }
}

export function restorePromptVersion(project: PromptProject, versionId: string, now = Date.now()): PromptProject {
  if (!project.versions.some((version) => version.id === versionId)) {
    throw new Error(`提示词版本不存在: ${versionId}`)
  }

  return {
    ...project,
    activeVersionId: versionId,
    updatedAt: now,
  }
}

export function getActivePromptVersion(project: PromptProject): PromptVersion | undefined {
  return project.versions.find((version) => version.id === project.activeVersionId)
}

export function buildPromptOptimizationContext(
  project: PromptProject,
  editorPrompt: string,
  instruction: string,
): PromptOptimizationContext {
  const activeVersion = getActivePromptVersion(project)
  return {
    brief: project.brief,
    prompt: editorPrompt,
    instruction,
    lockedFields: Object.entries(project.brief.fields)
      .filter(([, field]) => field.locked)
      .map(([id]) => id),
    ...(activeVersion ? { activeVersion } : {}),
  }
}
