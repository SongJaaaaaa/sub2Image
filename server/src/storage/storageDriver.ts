import type { Readable } from 'node:stream'

export type PutObjectInput = {
  key: string
  body: Readable
  maxBytes: number
}

export type StoredObject = {
  key: string
  size: number
  sha256: string
}

export type OpenRange = {
  start: number
  end: number
}

export interface StorageDriver {
  put(input: PutObjectInput): Promise<StoredObject>
  open(key: string, range?: OpenRange): Promise<Readable>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
