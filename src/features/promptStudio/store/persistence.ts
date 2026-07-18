import type { PromptProject } from '../types'
import type { PromptStudioStorage } from '../ports/storage'

export const PROMPT_PROJECT_SAVE_DELAY_MS = 400

export type PromptProjectRequestToken = {
  projectId: string
  requestId: string
  revision: number
}

export type PromptProjectPersistenceOptions = {
  delayMs?: number
  onError?: (err: unknown) => void
}

export type PromptProjectPersistence = {
  schedule(project: PromptProject): void
  save(project: PromptProject, token?: PromptProjectRequestToken): Promise<boolean>
  flush(projectId?: string): Promise<void>
  startRequest(projectId: string, requestId: string): PromptProjectRequestToken
  isCurrentRequest(token: PromptProjectRequestToken): boolean
  invalidateRequest(projectId: string): void
  dispose(): Promise<void>
}

export function createPromptProjectPersistence(
  storage: PromptStudioStorage,
  opts: PromptProjectPersistenceOptions = {},
): PromptProjectPersistence {
  const delayMs = opts.delayMs ?? PROMPT_PROJECT_SAVE_DELAY_MS
  const pending = new Map<string, PromptProject>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const writes = new Map<string, Promise<void>>()
  const requests = new Map<string, PromptProjectRequestToken>()
  const revisions = new Map<string, number>()

  const clearPending = (projectId: string) => {
    const timer = timers.get(projectId)
    if (timer) clearTimeout(timer)
    timers.delete(projectId)
    pending.delete(projectId)
  }

  const isCurrentRequest = (token: PromptProjectRequestToken) => {
    const current = requests.get(token.projectId)
    return current?.requestId === token.requestId && current.revision === token.revision
  }

  const enqueue = (project: PromptProject, token?: PromptProjectRequestToken) => {
    let saved = true
    const previous = writes.get(project.id) ?? Promise.resolve()
    const write = previous
      .catch(() => undefined)
      .then(async () => {
        if (token && (token.projectId !== project.id || !isCurrentRequest(token))) {
          saved = false
          return
        }
        await storage.put(project)
      })
    writes.set(project.id, write)
    void write.finally(() => {
      if (writes.get(project.id) === write) writes.delete(project.id)
    }).catch(() => undefined)
    return write.then(() => saved)
  }

  const save = async (project: PromptProject, token?: PromptProjectRequestToken) => {
    if (token && (token.projectId !== project.id || !isCurrentRequest(token))) return false
    clearPending(project.id)
    return enqueue(project, token)
  }

  const schedule = (project: PromptProject) => {
    clearPending(project.id)
    pending.set(project.id, project)
    timers.set(project.id, setTimeout(() => {
      timers.delete(project.id)
      const latest = pending.get(project.id)
      pending.delete(project.id)
      if (!latest) return
      void enqueue(latest).catch((err) => {
        if (opts.onError) opts.onError(err)
        else console.error(err)
      })
    }, delayMs))
  }

  const flush = async (projectId?: string) => {
    const ids = projectId ? [projectId] : Array.from(new Set([
      ...pending.keys(),
      ...writes.keys(),
    ]))
    await Promise.all(ids.map(async (id) => {
      const project = pending.get(id)
      if (project) await save(project)
      const write = writes.get(id)
      if (write) await write
    }))
  }

  const startRequest = (projectId: string, requestId: string) => {
    const revision = (revisions.get(projectId) ?? 0) + 1
    revisions.set(projectId, revision)
    const token = { projectId, requestId, revision }
    requests.set(projectId, token)
    return token
  }

  const invalidateRequest = (projectId: string) => {
    revisions.set(projectId, (revisions.get(projectId) ?? 0) + 1)
    requests.delete(projectId)
  }

  return {
    schedule,
    save,
    flush,
    startRequest,
    isCurrentRequest,
    invalidateRequest,
    async dispose() {
      await flush()
      requests.clear()
      revisions.clear()
    },
  }
}
