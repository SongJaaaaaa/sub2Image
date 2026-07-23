export interface GeminiVideoRequest {
  instances: Array<{
    prompt: string
    image?: {
      inlineData: {
        mimeType: string
        data: string
      }
    }
  }>
  parameters: {
    aspectRatio: string
    durationSeconds: number
    numberOfVideos: number
    resolution?: string
  }
}

export interface GeminiVideoOperation {
  name?: string
  done?: boolean
  error?: {
    code?: number
    status?: string
    message?: string
  }
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: {
          uri?: string
          mimeType?: string
        }
      }>
      raiMediaFilteredReasons?: string[]
    }
  }
}
