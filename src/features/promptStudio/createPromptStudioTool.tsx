import {
  createPromptStudioStore,
  type PromptStudioStore,
  type PromptStudioStoreOptions,
} from './store/createPromptStudioStore'

export type CreatePromptStudioToolOptions = PromptStudioStoreOptions

export type PromptStudioToolBundle = {
  store: PromptStudioStore
  stylesReady: Promise<void>
}

export function createPromptStudioTool(opts: CreatePromptStudioToolOptions): PromptStudioToolBundle {
  if (!opts.domains.length) throw new Error('Prompt Studio 至少需要注册一个领域')
  const stylesReady = import('./styles/promptStudio.css').then(() => undefined)
  const store = createPromptStudioStore(opts)

  return { store, stylesReady }
}
