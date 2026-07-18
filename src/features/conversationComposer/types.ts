import type { ComponentType } from 'react'

export type ConversationMessageKind = `${string}/${string}`

export type ConversationAttachment = {
  id: string
  type: string
  name?: string
  mimeType?: string
}

export type ConversationParams = Readonly<Record<string, unknown>>

export type ConversationSubmitInput = {
  text: string
  attachments: readonly ConversationAttachment[]
  params: ConversationParams
  payload?: unknown
}

export type ConversationToolComposerState = {
  placeholder: string
  canSubmit: boolean
  validationError: string | null
  running: boolean
}

export type ConversationToolComposerStateArgs = {
  conversationId: string
  input: ConversationSubmitInput
  running: boolean
}

export type ConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  kind: ConversationMessageKind
  content: string
  payload?: unknown
  createdAt: number
}

export type ConversationMessageProps = {
  message: ConversationMessage
}

export type ConversationMessageRenderer = ComponentType<ConversationMessageProps>
export type ConversationMessageRenderers = Readonly<Record<string, ConversationMessageRenderer>>

export type ConversationToolControlsProps = {
  conversationId: string
  toolId: string
  state: unknown
  setState: (state: unknown) => void
}

export type ConversationToolContext = {
  conversationId: string
  toolId: string
  requestId: string
  appendMessage: (message: ConversationMessage) => void
  getState: <T = unknown>() => T | undefined
  setState: (state: unknown) => void
  isCurrent: () => boolean
}

export type ConversationToolModule = {
  Controls?: ComponentType<ConversationToolControlsProps>
  messageRenderers: ConversationMessageRenderers
  validate: (input: ConversationSubmitInput) => string | null
  submit: (
    input: ConversationSubmitInput,
    ctx: ConversationToolContext,
    signal: AbortSignal,
  ) => Promise<void>
  stop?: (ctx: ConversationToolContext) => void
}

export type ConversationTool = {
  id: string
  label: string
  getComposerState: (args: ConversationToolComposerStateArgs) => ConversationToolComposerState
  load: () => Promise<ConversationToolModule>
}
