export type AssetKind = 'image' | 'video'

export type VoiceOption = {
  name: string
  locale: string
  gender: 'Female' | 'Male'
  displayName: string
}

export type SubtitleSegment = {
  id: number
  start: number
  end: number
  text: string
}

export type TranscriptionJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export type TranscriptionJob = {
  id: string
  status: TranscriptionJobStatus
  language?: string
  duration?: number
  segments?: SubtitleSegment[]
  error?: string
}

export type AssetMetadata = {
  width?: number
  height?: number
  duration?: number
  sourceId?: string
}

export type CloudAsset = {
  id: string
  assetId: string
  kind: AssetKind
  mimeType: string
  size: number
  sha256: string
  metadata: AssetMetadata
  contentUrl: string
  createdAt: string
}

export type TaskAssetRole = 'input' | 'output' | 'mask' | 'original' | 'video' | 'poster' | 'thumbnail'

export type TaskAssetRef = {
  assetId: string
  role: TaskAssetRole
  index: number
}

export type CloudTask = {
  id: string
  task: Record<string, unknown>
  createdAt: string
  updatedAt: string
  assets: Array<CloudAsset & { role: TaskAssetRole; index: number }>
}

export type CloudSkill = {
  id: string
  version: number
  fileName: string
  markdown: string
  createdAt: string
  updatedAt: string
}
