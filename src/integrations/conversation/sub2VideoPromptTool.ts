import type { PromptStudioToolBundle } from '../../features/promptStudio'

let bundle: PromptStudioToolBundle | null = null
let pending: Promise<PromptStudioToolBundle> | null = null

export function loadSub2VideoPromptStudio() {
  if (bundle) return Promise.resolve(bundle)
  if (pending) return pending
  pending = import('./sub2VideoPromptToolModule')
    .then(async (module) => {
      const next = module.createSub2VideoPromptStudio()
      await next.stylesReady
      bundle = next
      return next
    })
    .finally(() => {
      pending = null
    })
  return pending
}
