export function unwrap(body) {
  if (body && typeof body.code !== 'undefined') {
    if (body.code !== 0) throw new Error(body.message || 'Sub2API 请求失败')
    return body.data
  }
  return body
}

export function getItems(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  return []
}

export function findUserKey(data, keyId) {
  return getItems(data).find((item) => Number(item.id) === Number(keyId)) || null
}

export function matchAccounts(data, groupId) {
  return getItems(data).filter((item) => item.status === 'active' && Array.isArray(item.group_ids) && item.group_ids.some((id) => Number(id) === Number(groupId)))
}

export function mergeModels(results) {
  const models = new Map()
  results.flat().forEach((item) => {
    if (item?.id && !models.has(item.id)) models.set(item.id, item)
  })
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id))
}
