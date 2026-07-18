import { describe, expect, it } from 'vitest'
import { PROMPT_ARTIFACT_SCHEMA, PROMPT_INTERVIEW_SCHEMA } from '../core/schema'

function assertStrictObjects(schema: unknown) {
  if (!schema || typeof schema !== 'object') return
  if (Array.isArray(schema)) {
    for (const item of schema) assertStrictObjects(item)
    return
  }

  const value = schema as Record<string, unknown>
  if (value.type === 'object') {
    const properties = value.properties as Record<string, unknown>
    expect(value.additionalProperties).toBe(false)
    expect(value.required).toEqual(Object.keys(properties))
  }
  for (const item of Object.values(value)) assertStrictObjects(item)
}

describe('prompt studio JSON schema', () => {
  it('keeps domain-independent schema objects stable', () => {
    const interview = PROMPT_INTERVIEW_SCHEMA
    const artifact = PROMPT_ARTIFACT_SCHEMA

    expect(PROMPT_INTERVIEW_SCHEMA).toBe(interview)
    expect(PROMPT_ARTIFACT_SCHEMA).toBe(artifact)
    expect(JSON.stringify(interview)).not.toMatch(/subject|composition|image|video/)
    expect(JSON.stringify(artifact)).not.toMatch(/subject|composition|image|video/)
  })

  it('uses strict objects with every property required', () => {
    assertStrictObjects(PROMPT_INTERVIEW_SCHEMA)
    assertStrictObjects(PROMPT_ARTIFACT_SCHEMA)
  })

  it('uses arrays for patches and artifact params with nullable optional values', () => {
    expect(PROMPT_INTERVIEW_SCHEMA.properties.briefPatch.type).toBe('array')
    expect(PROMPT_INTERVIEW_SCHEMA.properties.briefPatch.items.properties.field.type).toBe('string')
    expect(PROMPT_ARTIFACT_SCHEMA.properties.params.type).toBe('array')
    expect(PROMPT_ARTIFACT_SCHEMA.properties.params.items.properties.name.type).toBe('string')

    const negativePrompt = PROMPT_ARTIFACT_SCHEMA.properties.negativePrompt.anyOf
    const shotList = PROMPT_ARTIFACT_SCHEMA.properties.shotList.anyOf
    const shot = shotList[0].items
    expect(negativePrompt.some((item) => item.type === 'null')).toBe(true)
    expect(shotList.some((item) => item.type === 'null')).toBe(true)
    expect(shot.properties.duration.anyOf.some((item) => item.type === 'null')).toBe(true)
    expect(shot.properties.audio.anyOf.some((item) => item.type === 'null')).toBe(true)
  })
})
