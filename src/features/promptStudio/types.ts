export type PromptDomain = string

export type PromptScalar = string | number | boolean
export type PromptValue = PromptScalar | PromptScalar[] | null

export type PromptAssetRole =
  | 'subject'
  | 'style'
  | 'composition'
  | 'start-frame'
  | 'end-frame'
  | 'unknown'

export type PromptSourceMessage = {
  id?: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: number
}

export type PromptSourceAsset = {
  id: string
  type: 'image'
  dataUrl: string
  label: string
  role?: PromptAssetRole
}

export type PromptStoredAssetRef = {
  id: string
  type: 'image'
  label: string
  role?: PromptAssetRole
  width?: number
  height?: number
}

export type PromptSourceMetadata = Record<string, PromptScalar>

export type PromptStudioSource = {
  type: 'text' | 'conversation' | 'task' | 'project'
  id?: string
  title?: string
  text?: string
  messages?: PromptSourceMessage[]
  assets?: PromptSourceAsset[]
  metadata?: PromptSourceMetadata
}

export type PromptStudioSourceSnapshot = Omit<PromptStudioSource, 'assets'> & {
  assets?: PromptStoredAssetRef[]
}

export type PromptBriefFieldStatus = 'missing' | 'answered' | 'delegated' | 'not-applicable'
export type PromptBriefFieldOrigin = 'source' | 'user' | 'model'

export type PromptBriefField = {
  value: PromptValue
  status: PromptBriefFieldStatus
  origin: PromptBriefFieldOrigin
  locked: boolean
  updatedAt: number
}

export type PromptBrief = {
  domain: PromptDomain
  fields: Record<string, PromptBriefField>
}

export type PromptBriefPatchEntry = {
  field: string
  value: PromptValue
  status: PromptBriefFieldStatus
  origin: PromptBriefFieldOrigin
  locked: boolean
}

export type PromptInterviewPatchEntry = Omit<PromptBriefPatchEntry, 'status'> & {
  status: Exclude<PromptBriefFieldStatus, 'missing'>
}

export type PromptFieldCondition =
  | {
      field: string
      op: 'equals' | 'not-equals' | 'includes'
      value: PromptValue
    }
  | {
      field: string
      op: 'present'
    }
  | {
      all: PromptFieldCondition[]
    }
  | {
      any: PromptFieldCondition[]
    }

export type PromptAmbiguityRule = {
  terms: string[]
  fields?: string[]
  question: string
}

export type PromptQuestionInput = 'single' | 'multiple' | 'text' | 'number'

export type PromptQuestionOption = {
  label: string
  value: PromptScalar
}

export type PromptQuestion = {
  id: string
  field: string
  text: string
  input: PromptQuestionInput
  options: PromptQuestionOption[]
  required: boolean
}

export type PromptFieldDefinition = {
  id: string
  label: string
  group: string
  required: boolean
  appliesWhen?: PromptFieldCondition
  dependsOn?: string[]
}

export type PromptDomainDefinition = {
  id: PromptDomain
  label: string
  fields: PromptFieldDefinition[]
  ambiguities?: PromptAmbiguityRule[]
  buildInstructions: (brief: PromptBrief) => string
  buildArtifactInstructions: (brief: PromptBrief) => string
  canInheritFrom: PromptDomain[]
}

export type PromptFieldConflict = {
  field: string
  current: PromptBriefField
  next: PromptBriefPatchEntry
  reason: 'locked-change' | 'dependency-change'
}

export type PromptBriefIssue = {
  field: string
  code: 'unknown-field' | 'empty-answer' | 'ambiguous-value'
  message: string
}

export type PromptBriefMergeResult = {
  brief: PromptBrief
  changedFields: string[]
  invalidatedFields: string[]
  conflicts: PromptFieldConflict[]
  issues: PromptBriefIssue[]
}

export type PromptStudioMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  questionIds?: string[]
  createdAt: number
}

export type PromptShot = {
  index: number
  duration?: number
  prompt: string
  audio?: string
}

export type PromptArtifact = {
  domain: PromptDomain
  title: string
  prompt: string
  negativePrompt?: string
  params: Record<string, PromptScalar>
  shotList?: PromptShot[]
}

export type PromptArtifactParam = {
  name: string
  value: PromptScalar
}

export type PromptModelShot = {
  index: number
  duration: number | null
  prompt: string
  audio: string | null
}

export type PromptModelArtifact = Omit<PromptArtifact, 'negativePrompt' | 'params' | 'shotList'> & {
  negativePrompt: string | null
  params: PromptArtifactParam[]
  shotList: PromptModelShot[] | null
}

export type PromptVersion = {
  id: string
  artifact: PromptArtifact
  source: 'model' | 'user'
  instruction?: string
  createdAt: number
}

export type PromptStudioPhase =
  | 'extracting'
  | 'interview'
  | 'review'
  | 'generating'
  | 'ready'
  | 'error'

export type PromptProject = {
  id: string
  conversationId?: string
  domain: PromptDomain
  title: string
  source: PromptStudioSourceSnapshot
  brief: PromptBrief
  messages: PromptStudioMessage[]
  pendingConflicts: PromptFieldConflict[]
  versions: PromptVersion[]
  activeVersionId?: string
  phase: PromptStudioPhase
  schemaVersion: 1
  createdAt: number
  updatedAt: number
}

export type PromptInterviewReply = {
  phase: 'interview' | 'review'
  message: string
  briefPatch: PromptInterviewPatchEntry[]
  questions: PromptQuestion[]
}
