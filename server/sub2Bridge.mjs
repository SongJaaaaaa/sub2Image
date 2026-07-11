import http from 'node:http'
import { findUserKey, getItems, matchAccounts, mergeModels, unwrap } from './sub2BridgeCore.mjs'

const port = Number(process.env.PORT || 8787)
const sub2Url = (process.env.SUB2API_URL || '').replace(/\/+$/, '')
const adminKey = process.env.SUB2API_ADMIN_KEY || ''

function log(stage, data = {}) {
  console.log(`[sub2-bridge] ${stage}`, data)
}

async function request(path, headers = {}) {
  const res = await fetch(`${sub2Url}/api/v1/${path.replace(/^\/+/, '')}`, { headers })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`上游返回非 JSON (${res.status})`)
  }
  if (!res.ok) {
    const err = new Error(body?.message || `上游请求失败 (${res.status})`)
    err.status = res.status
    throw err
  }
  return unwrap(body)
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function getKeyModels(req, res, keyId) {
  const authorization = req.headers.authorization || ''
  if (!authorization.startsWith('Bearer ')) return json(res, 401, { message: '请先登录 Sub2API' })

  log('models:start', { keyId })
  await request('auth/me', { Authorization: authorization })
  const keyData = await request('keys?page=1&page_size=100', { Authorization: authorization })
  const key = findUserKey(keyData, keyId)
  if (!key) return json(res, 403, { message: '该 API Key 不属于当前用户' })
  if (!key.group_id) return json(res, 400, { message: '该 API Key 尚未绑定分组' })

  const accountData = await request('admin/accounts?page=1&page_size=100', { 'x-api-key': adminKey })
  const accounts = matchAccounts(accountData, key.group_id)
  log('models:accounts', { keyId, groupId: key.group_id, count: accounts.length })
  if (!accounts.length) return json(res, 404, { message: '该 Key 所属分组没有可用账号或模型' })

  const results = await Promise.all(accounts.map(async (account) => {
    try {
      const data = await request(`admin/accounts/${account.id}/models`, { 'x-api-key': adminKey })
      return getItems(data)
    } catch (err) {
      log('models:account-error', { keyId, groupId: key.group_id, accountId: account.id, message: err instanceof Error ? err.message : String(err) })
      return []
    }
  }))
  const models = mergeModels(results)
  if (!models.length) return json(res, 404, { message: '该 Key 所属分组没有可用账号或模型' })

  return json(res, 200, {
    key: {
      id: key.id,
      name: key.name,
      group_id: key.group_id,
      group_name: key.group?.name || '',
      platform: key.group?.platform || accounts[0]?.platform || '',
    },
    accounts: accounts.map((account) => ({ id: account.id, name: account.name, platform: account.platform })),
    models,
  })
}

if (!sub2Url || !adminKey) {
  console.error('[sub2-bridge] 缺少 SUB2API_URL 或 SUB2API_ADMIN_KEY')
  process.exit(1)
}

http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true })
    const match = req.method === 'GET' && req.url?.match(/^\/keys\/(\d+)\/models(?:\?.*)?$/)
    if (match) return await getKeyModels(req, res, Number(match[1]))
    return json(res, 404, { message: 'Not Found' })
  } catch (err) {
    log('request:error', { path: req.url, message: err instanceof Error ? err.message : String(err) })
    const status = err?.status === 401 ? 401 : 502
    return json(res, status, { message: err instanceof Error ? err.message : String(err) })
  }
}).listen(port, '0.0.0.0', () => log('listening', { port }))
