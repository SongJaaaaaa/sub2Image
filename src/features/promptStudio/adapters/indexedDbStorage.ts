import type { PromptProject } from '../types'
import { migratePromptProject } from '../core/persistence'
import type { PromptStudioStorage } from '../ports/storage'
import {
  openPromptStudioDatabase,
  PROMPT_PROJECT_CONVERSATION_INDEX,
  PROMPT_PROJECTS_STORE,
  toPromptStudioIndexedDbError,
  waitForPromptStudioTransaction,
  type PromptStudioIndexedDbOptions,
} from './indexedDb'

export function createIndexedDbStorage(
  opts: PromptStudioIndexedDbOptions = {},
): PromptStudioStorage {
  return {
    async list() {
      return runProjectRequest(opts, 'readonly', (store) => store.getAll(), (projects) =>
        projects
          .map(migratePromptProject)
          .sort((a, b) => b.updatedAt - a.updatedAt))
    },
    async get(id) {
      return runProjectRequest(opts, 'readonly', (store) => store.get(id), (project) =>
        project == null ? null : migratePromptProject(project))
    },
    async getByConversationId(conversationId) {
      return runProjectRequest(
        opts,
        'readonly',
        (store) => store.index(PROMPT_PROJECT_CONVERSATION_INDEX).getAll(conversationId),
        (projects) => {
          const project = projects.sort((a, b) => getUpdatedAt(b) - getUpdatedAt(a))[0]
          return project == null ? null : migratePromptProject(project)
        },
      )
    },
    async put(project) {
      await runProjectRequest(opts, 'readwrite', (store) => store.put(project), () => undefined)
    },
    async delete(id) {
      await runProjectRequest(opts, 'readwrite', (store) => store.delete(id), () => undefined)
    },
  }
}

async function runProjectRequest<T, R>(
  opts: PromptStudioIndexedDbOptions,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
  getResult: (result: T) => R,
): Promise<R> {
  try {
    const db = await openPromptStudioDatabase(opts)
    const tx = db.transaction(PROMPT_PROJECTS_STORE, mode)
    const req = createRequest(tx.objectStore(PROMPT_PROJECTS_STORE))
    return await waitForPromptStudioTransaction(tx, () => getResult(req.result))
  } catch (err) {
    throw toPromptStudioIndexedDbError(err, 'transaction')
  }
}

function getUpdatedAt(value: unknown) {
  if (!value || typeof value !== 'object') return 0
  const updatedAt = (value as Partial<PromptProject>).updatedAt
  return typeof updatedAt === 'number' ? updatedAt : 0
}
