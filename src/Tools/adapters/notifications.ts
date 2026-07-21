import { useStore } from '../../store'

export function notifyTool(message: string, type: 'info' | 'success' | 'error' = 'info') {
  useStore.getState().showToast(message, type)
}
