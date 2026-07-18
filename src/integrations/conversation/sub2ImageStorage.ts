import { migratePromptProject, type PromptProject, type PromptStudioStorage } from '../../features/promptStudio'
import {
  deletePromptProject,
  getAllPromptProjects,
  getPromptProject,
  getPromptProjectByConversationId,
  putPromptProject,
} from '../../lib/db'

export const sub2ImageStorage: PromptStudioStorage = {
  list: async () => {
    const projects = await Promise.all((await getAllPromptProjects()).map(migrateStoredProject))
    return projects.sort((a, b) => b.updatedAt - a.updatedAt)
  },
  get: async (id) => {
    const project = await getPromptProject(id)
    return project ? migrateStoredProject(project) : null
  },
  getByConversationId: async (conversationId) => {
    const project = await getPromptProjectByConversationId(conversationId)
    return project ? migrateStoredProject(project) : null
  },
  put: async (project) => {
    await putPromptProject(project)
  },
  delete: async (id) => {
    await deletePromptProject(id)
  },
}

async function migrateStoredProject(project: PromptProject) {
  const migrated = migratePromptProject(project)
  if (JSON.stringify(migrated) !== JSON.stringify(project)) await putPromptProject(migrated)
  return migrated
}
