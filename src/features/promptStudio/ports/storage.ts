import type { PromptProject } from '../types'

export interface PromptStudioStorage {
  list(): Promise<PromptProject[]>
  get(id: string): Promise<PromptProject | null>
  getByConversationId(conversationId: string): Promise<PromptProject | null>
  put(project: PromptProject): Promise<void>
  delete(id: string): Promise<void>
}
