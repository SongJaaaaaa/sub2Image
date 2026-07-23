export interface JimengVideoRequest {
  model: string
  prompt: string
  ratio: string
  resolution: string
  duration: number
}

export interface JimengVideoGenerationResponse {
  created?: number
  data?: Array<{
    url?: string
    revised_prompt?: string
  }>
}
