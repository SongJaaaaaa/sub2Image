export interface GrokVideoGenerationResponse {
  request_id?: string
}

export interface GrokVideoStatusResponse {
  status?: 'pending' | 'done' | 'expired' | 'failed'
  video?: {
    url?: string
    duration?: number
    width?: number
    height?: number
    mime_type?: string
  }
  error?: {
    message?: string
  }
}
