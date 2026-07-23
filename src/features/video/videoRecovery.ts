import { executeVideoTask } from './videoExecution'

export function recoverVideoTask(taskId: string) {
  void executeVideoTask(taskId)
}
