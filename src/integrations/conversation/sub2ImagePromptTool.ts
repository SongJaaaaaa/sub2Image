import type { PromptStudioToolBundle } from '../../features/promptStudio'

let bundle: PromptStudioToolBundle | null = null
let pending: Promise<PromptStudioToolBundle> | null = null

export function loadSub2ImagePromptStudio() {
  if (bundle) return Promise.resolve(bundle)
  if (pending) return pending
  pending = import('./sub2ImagePromptToolModule')
    .then(async (module) => {
      const next = module.createSub2ImagePromptStudio()
      await next.stylesReady
      bundle = next
      return next
    })
    .finally(() => {
      pending = null
    })
  return pending
}
