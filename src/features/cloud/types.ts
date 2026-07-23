import type { StoredImage, StoredImageThumbnail, StoredVideo, TaskRecord } from '../../types'

export type CloudAssetKind = 'image' | 'video'
export type CloudAssetRole = 'input' | 'output' | 'mask' | 'original' | 'video' | 'poster' | 'thumbnail'
export type CloudUploadStatus = 'pending' | 'uploaded' | 'complete'
export type CloudTransferState = 'preparing' | 'uploading' | 'saving' | 'done' | 'error'

export interface CloudAccount {
  id: string
  provider: string
  externalUserId: string
  email?: string
  usedBytes: number
  quotaBytes: number
  createdAt: string
  lastSeenAt: string
}

export interface CloudAssetMetadata {
  width?: number
  height?: number
  duration?: number
  sourceId?: string
}

export interface CloudAsset {
  id: string
  assetId: string
  kind: CloudAssetKind
  mimeType: string
  size: number
  sha256: string
  metadata: CloudAssetMetadata
  contentUrl: string
  createdAt: string
}

export interface CloudTaskAsset extends CloudAsset {
  role: CloudAssetRole
  index: number
}

export interface CloudTaskAssetRef {
  assetId: string
  role: CloudAssetRole
  index: number
}

export interface CloudTask {
  id: string
  task: TaskRecord
  assets: CloudTaskAsset[]
  createdAt: string
  updatedAt: string
}

export interface CloudSkill {
  id: string
  version: number
  fileName: string
  markdown: string
  createdAt: string
  updatedAt: string
}

export interface CloudBootstrap {
  account: CloudAccount
  tasks: CloudTask[]
  skills: CloudSkill[]
}

export interface CloudUploadInput {
  assetId: string
  kind: CloudAssetKind
  mimeType: string
  size: number
  sha256: string
  metadata?: CloudAssetMetadata
}

export interface CloudUpload {
  id: string
  assetId: string
  status: CloudUploadStatus
  uploadRequired: boolean
  asset?: CloudAsset
}

export interface CloudTaskProgress {
  taskId: string
  state: CloudTransferState
  completed: number
  total: number
  assetId?: string
  error?: string
}

export interface CloudTaskFailure {
  taskId: string
  error: Error
}

export interface CloudTaskBatchResult {
  saved: CloudTask[]
  failed: CloudTaskFailure[]
}

export interface CloudTaskSaveOptions {
  onProgress?: (progress: CloudTaskProgress) => void
  signal?: AbortSignal
}

export interface CloudCacheProgress {
  completed: number
  total: number
  assetId?: string
}

export interface CloudBootstrapOptions {
  cacheThumbnails?: boolean
  onProgress?: (progress: CloudCacheProgress) => void
  signal?: AbortSignal
}

export type CachedCloudAsset = StoredImage | StoredImageThumbnail | StoredVideo
