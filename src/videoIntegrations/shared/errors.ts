export class VideoApiError extends Error {
  status?: number
  rawResponsePayload?: string

  constructor(message: string, opts: { status?: number; rawResponsePayload?: string } = {}) {
    super(message)
    this.name = 'VideoApiError'
    this.status = opts.status
    this.rawResponsePayload = opts.rawResponsePayload
  }
}
