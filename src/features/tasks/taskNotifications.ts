import { normalizeSettings } from '../../lib/apiProfiles'
import { showBrowserNotification } from '../../lib/browserNotification'
import { useStore } from '../../state/appStore'

export function showTaskCompletionNotification(title: string, body: string) {
  const settings = normalizeSettings(useStore.getState().settings)
  if (!settings.taskCompletionNotification) return
  showBrowserNotification(title, { body })
}
