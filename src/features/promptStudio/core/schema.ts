const scalarSchema = {
  anyOf: [
    { type: 'string' },
    { type: 'number' },
    { type: 'boolean' },
  ],
} as const

const valueSchema = {
  anyOf: [
    ...scalarSchema.anyOf,
    { type: 'array', items: scalarSchema },
    { type: 'null' },
  ],
} as const

const questionOptionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string' },
    value: scalarSchema,
  },
  required: ['label', 'value'],
} as const

const questionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    field: { type: 'string' },
    text: { type: 'string' },
    input: { type: 'string', enum: ['single', 'multiple', 'text', 'number'] },
    options: { type: 'array', items: questionOptionSchema },
    required: { type: 'boolean' },
  },
  required: ['id', 'field', 'text', 'input', 'options', 'required'],
} as const

const briefPatchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    field: { type: 'string' },
    value: valueSchema,
    status: { type: 'string', enum: ['answered', 'delegated', 'not-applicable'] },
    origin: { type: 'string', enum: ['source', 'user', 'model'] },
    locked: { type: 'boolean' },
  },
  required: ['field', 'value', 'status', 'origin', 'locked'],
} as const

export const PROMPT_INTERVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    phase: { type: 'string', enum: ['interview', 'review'] },
    message: { type: 'string' },
    briefPatch: { type: 'array', items: briefPatchSchema },
    questions: { type: 'array', items: questionSchema },
  },
  required: ['phase', 'message', 'briefPatch', 'questions'],
} as const

const artifactParamSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    value: scalarSchema,
  },
  required: ['name', 'value'],
} as const

const shotSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    index: { type: 'integer' },
    duration: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    prompt: { type: 'string' },
    audio: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['index', 'duration', 'prompt', 'audio'],
} as const

export const PROMPT_ARTIFACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    domain: { type: 'string' },
    title: { type: 'string' },
    prompt: { type: 'string', minLength: 1 },
    negativePrompt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    params: { type: 'array', items: artifactParamSchema },
    shotList: {
      anyOf: [
        { type: 'array', items: shotSchema },
        { type: 'null' },
      ],
    },
  },
  required: ['domain', 'title', 'prompt', 'negativePrompt', 'params', 'shotList'],
} as const
