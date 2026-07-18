import type {
  PromptAmbiguityRule,
  PromptBrief,
  PromptBriefField,
  PromptBriefMergeResult,
  PromptBriefPatchEntry,
  PromptDomainDefinition,
  PromptFieldCondition,
  PromptFieldDefinition,
  PromptValue,
} from '../types'

const COMPLETE_STATUSES = new Set(['answered', 'delegated', 'not-applicable'])

export function createPromptBrief(domain: PromptDomainDefinition, now = Date.now()): PromptBrief {
  const fields = Object.fromEntries(domain.fields.map((field) => [field.id, missingField(now)]))
  const brief = { domain: domain.id, fields }

  return initializeConditionalFields(brief, domain, now)
}

export function isPromptFieldApplicable(
  brief: PromptBrief,
  field: PromptFieldDefinition,
) {
  return !field.appliesWhen || matchesCondition(brief, field.appliesWhen)
}

export function getMissingPromptFields(brief: PromptBrief, domain: PromptDomainDefinition) {
  return domain.fields.filter((field) => {
    if (!field.required || !isPromptFieldApplicable(brief, field)) return false
    return !COMPLETE_STATUSES.has(brief.fields[field.id]?.status || 'missing')
  })
}

export function isPromptBriefComplete(brief: PromptBrief, domain: PromptDomainDefinition) {
  return getMissingPromptFields(brief, domain).length === 0
}

export function findPromptAmbiguity(
  field: string,
  value: PromptValue,
  domain: PromptDomainDefinition,
): PromptAmbiguityRule | undefined {
  const text = Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : ''
  if (!text) return undefined
  const normalized = text.toLocaleLowerCase()

  return domain.ambiguities?.find((rule) => {
    if (rule.fields?.length && !rule.fields.includes(field)) return false
    return rule.terms.some((term) => normalized.includes(term.toLocaleLowerCase()))
  })
}

export function mergePromptBrief(
  brief: PromptBrief,
  patch: readonly PromptBriefPatchEntry[],
  domain: PromptDomainDefinition,
  now = Date.now(),
): PromptBriefMergeResult {
  const fields = { ...brief.fields }
  const changed = new Set<string>()
  const dependencyChanges = new Set<string>()
  const direct = new Set<string>()
  const conflicts: PromptBriefMergeResult['conflicts'] = []
  const issues: PromptBriefMergeResult['issues'] = []

  for (const item of patch) {
    const next = {
      ...item,
      locked: item.origin === 'user' ? true : item.origin === 'model' ? false : item.locked,
    }
    if (!domain.fields.some((field) => field.id === next.field)) {
      issues.push({ field: next.field, code: 'unknown-field', message: `未知字段: ${next.field}` })
      continue
    }

    if (next.status === 'answered' && !hasPromptValue(next.value)) {
      issues.push({ field: next.field, code: 'empty-answer', message: `字段回答不能为空: ${next.field}` })
      continue
    }

    const rule = next.status === 'answered'
      ? findPromptAmbiguity(next.field, next.value, domain)
      : undefined
    if (rule) {
      issues.push({ field: next.field, code: 'ambiguous-value', message: rule.question })
      continue
    }

    const current = fields[next.field] || missingField(now)
    if (sameField(current, next)) continue
    // 用户确认的字段优先，模型不能静默覆盖；用户后续的新回答可以更新旧回答。
    if (current.locked && next.origin === 'model') continue

    fields[next.field] = { ...next, updatedAt: now }
    changed.add(next.field)
    direct.add(next.field)
    if (current.status !== next.status || !sameValue(current.value, next.value)) {
      dependencyChanges.add(next.field)
    }
  }

  const invalidated = new Set<string>()
  const pending = [...dependencyChanges]
  while (pending.length) {
    const parent = pending.shift()!
    for (const field of domain.fields) {
      if (!field.dependsOn?.includes(parent) || direct.has(field.id) || invalidated.has(field.id)) continue
      const current = fields[field.id] || missingField(now)
      if (current.status === 'missing' || current.status === 'not-applicable') continue

      const applies = isPromptFieldApplicable({ domain: brief.domain, fields }, field)
      const next: PromptBriefPatchEntry = {
        field: field.id,
        value: null,
        status: applies ? 'missing' : 'not-applicable',
        origin: 'model',
        locked: false,
      }
      fields[field.id] = { ...next, updatedAt: now }
      invalidated.add(field.id)
      pending.push(field.id)
    }
  }

  applyConditionalChanges(brief, fields, domain, direct, conflicts, invalidated, now)

  return {
    brief: { domain: brief.domain, fields },
    changedFields: [...changed],
    invalidatedFields: [...invalidated],
    conflicts,
    issues,
  }
}

export function applyPromptConflict(
  brief: PromptBrief,
  conflict: PromptBriefMergeResult['conflicts'][number],
  domain: PromptDomainDefinition,
  now = Date.now(),
) {
  if (conflict.next.field !== conflict.field) throw new Error(`字段冲突目标不匹配: ${conflict.field}`)
  const current = brief.fields[conflict.field]
  if (!current || !sameBriefField(current, conflict.current)) throw new Error(`字段冲突已过期: ${conflict.field}`)
  const fields = {
    ...brief.fields,
    [conflict.field]: { ...current, locked: false },
  }
  return mergePromptBrief({ domain: brief.domain, fields }, [conflict.next], domain, now)
}

function initializeConditionalFields(
  brief: PromptBrief,
  domain: PromptDomainDefinition,
  now: number,
) {
  const fields = { ...brief.fields }
  for (const field of domain.fields) {
    const current = fields[field.id] || missingField(now)
    const applies = isPromptFieldApplicable({ domain: brief.domain, fields }, field)
    if (!applies && current.status !== 'not-applicable') {
      fields[field.id] = {
        value: null,
        status: 'not-applicable',
        origin: 'model',
        locked: false,
        updatedAt: now,
      }
    }
  }
  return { domain: brief.domain, fields }
}

function applyConditionalChanges(
  previous: PromptBrief,
  fields: Record<string, PromptBriefField>,
  domain: PromptDomainDefinition,
  direct: Set<string>,
  conflicts: PromptBriefMergeResult['conflicts'],
  invalidated: Set<string>,
  now: number,
) {
  let updated = true
  while (updated) {
    updated = false
    for (const field of domain.fields) {
      if (!field.appliesWhen) continue
      const wasApplicable = isPromptFieldApplicable(previous, field)
      const applies = isPromptFieldApplicable({ domain: previous.domain, fields }, field)
      const current = fields[field.id] || missingField(now)
      if (applies && (wasApplicable || direct.has(field.id))) continue
      if (applies && current.status !== 'not-applicable') continue
      if (!applies && current.status === 'not-applicable') continue

      const next: PromptBriefPatchEntry = {
        field: field.id,
        value: null,
        status: applies ? 'missing' : 'not-applicable',
        origin: 'model',
        locked: false,
      }
      if (current.status === next.status && current.value === null) continue

      fields[field.id] = { ...next, updatedAt: now }
      invalidated.add(field.id)
      updated = true
    }
  }
}

function matchesCondition(brief: PromptBrief, condition: PromptFieldCondition): boolean {
  if ('all' in condition) return condition.all.every((item) => matchesCondition(brief, item))
  if ('any' in condition) return condition.any.some((item) => matchesCondition(brief, item))

  const field = brief.fields[condition.field]
  if (condition.op === 'present') {
    if (!field || field.status === 'missing' || field.value == null) return false
    return !Array.isArray(field.value) || field.value.length > 0
  }
  if (!field || field.status === 'missing' || field.status === 'not-applicable') return false
  const value = field.value
  if (condition.op === 'equals') return sameValue(value, condition.value)
  if (condition.op === 'not-equals') return !sameValue(value, condition.value)
  if (Array.isArray(value)) {
    const expected = Array.isArray(condition.value) ? condition.value : [condition.value]
    return expected.every((item) => value.some((current) => sameValue(current, item)))
  }
  return typeof value === 'string' && typeof condition.value === 'string'
    ? value.includes(condition.value)
    : false
}

function missingField(now: number): PromptBriefField {
  return {
    value: null,
    status: 'missing',
    origin: 'model',
    locked: false,
    updatedAt: now,
  }
}

function sameField(current: PromptBriefField, next: PromptBriefPatchEntry) {
  return current.status === next.status
    && current.origin === next.origin
    && current.locked === next.locked
    && sameValue(current.value, next.value)
}

function sameBriefField(first: PromptBriefField, second: PromptBriefField) {
  return first.status === second.status
    && first.origin === second.origin
    && first.locked === second.locked
    && first.updatedAt === second.updatedAt
    && sameValue(first.value, second.value)
}

function hasPromptValue(value: PromptValue) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) {
    return value.length > 0 && value.some((item) => typeof item !== 'string' || item.trim().length > 0)
  }
  return true
}

function sameValue(first: PromptValue, second: PromptValue) {
  return JSON.stringify(first) === JSON.stringify(second)
}
