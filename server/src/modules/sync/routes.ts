import type { FastifyInstance } from 'fastify'

import type { CloudConfig } from '../../config.js'
import type { AccountService } from '../account/accountService.js'
import { getAccountView } from '../account/routes.js'
import type { AssetService } from '../assets/assetService.js'
import type { SkillService } from '../skills/skillService.js'
import type { TaskService } from '../tasks/taskService.js'

export function registerSyncRoutes(
  app: FastifyInstance,
  deps: {
    accounts: AccountService
    assets: AssetService
    tasks: TaskService
    skills: SkillService
    cfg: CloudConfig
  }
) {
  app.get('/api/sync/bootstrap', async (req) => {
    const [account, tasks, skills] = await Promise.all([
      getAccountView(req.accountId, deps.accounts, deps.assets, deps.cfg),
      deps.tasks.list(req.accountId),
      deps.skills.list(req.accountId)
    ])
    return { data: { account, tasks, skills } }
  })
}
