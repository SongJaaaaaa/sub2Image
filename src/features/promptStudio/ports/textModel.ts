import type { PromptArtifact, PromptInterviewReply } from '../types'

export type TextModelFormat = 'interview' | 'artifact'

export type TextModelImage = {
  id: string
  label: string
}

export type TextModelRequest = {
  format: TextModelFormat
  instructions: string
  input: string
  images?: readonly TextModelImage[]
}

export type TextModelResponse =
  | {
      format: 'interview'
      output: PromptInterviewReply
      rawResponse: string
    }
  | {
      format: 'artifact'
      output: PromptArtifact
      rawResponse: string
    }

export type TextModelResponseErrorCode =
  | 'http'
  | 'failed'
  | 'refusal'
  | 'incomplete'
  | 'empty-output'
  | 'invalid-json'
  | 'invalid-response'

export class TextModelResponseError extends Error {
  readonly code: TextModelResponseErrorCode
  readonly rawResponse: string

  constructor(code: TextModelResponseErrorCode, message: string, rawResponse: string) {
    super(message)
    this.name = 'TextModelResponseError'
    this.code = code
    this.rawResponse = rawResponse
  }
}

export interface TextModelPort {
  respond(input: TextModelRequest, signal: AbortSignal): Promise<TextModelResponse>
}
