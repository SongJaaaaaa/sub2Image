import type {
  PromptBrief,
  PromptDomainDefinition,
  PromptQuestion,
} from '../types'
import { isPromptFieldApplicable } from './brief'

export function getQuestionablePromptFields(
  brief: PromptBrief,
  domain: PromptDomainDefinition,
) {
  return domain.fields.filter((field) => {
    if (!isPromptFieldApplicable(brief, field)) return false
    return brief.fields[field.id]?.status === 'missing'
  })
}

export function validatePromptQuestions(
  questions: readonly PromptQuestion[],
  brief: PromptBrief,
  domain: PromptDomainDefinition,
  phase: 'interview' | 'review',
) {
  const errors: string[] = []
  if (phase === 'review' && questions.length) errors.push('需求确认阶段不能继续返回问题')
  const ids = new Set<string>()
  const fields = new Set<string>()
  for (const question of questions) {
    if (ids.has(question.id)) errors.push(`问题 ID 重复: ${question.id}`)
    ids.add(question.id)
    if (fields.has(question.field)) errors.push(`一轮不能重复询问字段: ${question.field}`)
    fields.add(question.field)

    const field = domain.fields.find((item) => item.id === question.field)
    if (!field) {
      errors.push(`问题引用未知字段: ${question.field}`)
      continue
    }
    if (!isPromptFieldApplicable(brief, field)) errors.push(`问题引用当前不适用字段: ${question.field}`)
    if (domain.id === 'image' && (question.input !== 'single' || question.options.length < 2 || question.options.length > 3)) {
      errors.push(`图片问题必须提供 2～3 个推荐选项: ${question.id}`)
      continue
    }
    if ((question.input === 'single' || question.input === 'multiple') && question.options.length < 2) {
      errors.push(`选择题至少需要两个选项: ${question.id}`)
    }
    if ((question.input === 'text' || question.input === 'number') && question.options.length) {
      errors.push(`文本或数值问题不能包含选项: ${question.id}`)
    }
  }
  return errors
}

export function assertPromptQuestions(
  questions: readonly PromptQuestion[],
  brief: PromptBrief,
  domain: PromptDomainDefinition,
  phase: 'interview' | 'review',
) {
  const errors = validatePromptQuestions(questions, brief, domain, phase)
  if (errors.length) throw new Error(errors.join('\n'))
}

export function limitPromptQuestions(questions: readonly PromptQuestion[]) {
  const seen = new Set<string>()
  return questions.filter((question) => {
    if (seen.has(question.field)) return false
    seen.add(question.field)
    return true
  })
}

/**
 * 过滤掉模型偶发返回的非法问题（未知/不适用字段、重复 ID 或字段、选项数量不符合领域约束），
 * 让面试流程保持健壮，而不是因为单个坏问题直接抛错中断。
 */
export function sanitizePromptQuestions(
  questions: readonly PromptQuestion[],
  brief: PromptBrief,
  domain: PromptDomainDefinition,
): PromptQuestion[] {
  const ids = new Set<string>()
  const fields = new Set<string>()
  return questions.filter((question) => {
    if (ids.has(question.id) || fields.has(question.field)) return false
    const field = domain.fields.find((item) => item.id === question.field)
    if (!field || !isPromptFieldApplicable(brief, field)) return false
    if (domain.id === 'image' && (question.input !== 'single' || question.options.length < 2 || question.options.length > 3)) {
      return false
    }
    if ((question.input === 'single' || question.input === 'multiple') && question.options.length < 2) return false
    if ((question.input === 'text' || question.input === 'number') && question.options.length) return false
    ids.add(question.id)
    fields.add(question.field)
    return true
  })
}
