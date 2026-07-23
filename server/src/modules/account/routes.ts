import type { FastifyInstance } from 'fastify'

import type { CloudConfig } from '../../config.js'
import type { AssetService } from '../assets/assetService.js'
import type { AccountService } from './accountService.js'

export async function getAccountView(
  accountId: string,
  accounts: AccountService,
  assets: AssetService,
  cfg: CloudConfig
) {
  const [account, used] = await Promise.all([
    accounts.get(accountId),
    assets.getUsage(accountId)
  ])
  return accounts.toPublic(account, used, cfg.quotaBytes)
}

export function registerAccountRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  assets: AssetService,
  cfg: CloudConfig
) {
  app.get('/api/account', async (req) => ({
    data: await getAccountView(req.accountId, accounts, assets, cfg)
  }))
}
