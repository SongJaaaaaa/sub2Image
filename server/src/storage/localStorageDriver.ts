import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { AppError } from '../errors.js'
import type { OpenRange, PutObjectInput, StorageDriver } from './storageDriver.js'

const TEMP_FILE_PATTERN = /^.+\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/

export class LocalStorageDriver implements StorageDriver {
  private root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  private path(key: string) {
    const file = resolve(this.root, key)
    if (file === this.root || !file.startsWith(`${this.root}${sep}`)) {
      throw new AppError(400, 'INVALID_OBJECT_KEY', '文件路径无效')
    }
    return file
  }

  async cleanupTempFiles() {
    await mkdir(this.root, { recursive: true })
    const dirs = [this.root]
    let count = 0

    while (dirs.length) {
      const dir = dirs.pop()!
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const file = resolve(dir, entry.name)
        if (entry.isDirectory()) {
          dirs.push(file)
          continue
        }
        if (!entry.isFile() || !TEMP_FILE_PATTERN.test(entry.name)) continue
        await rm(file, { force: true })
        count += 1
      }
    }
    return count
  }

  async put(input: PutObjectInput) {
    const file = this.path(input.key)
    const temp = `${file}.${randomUUID()}.tmp`
    const hash = createHash('sha256')
    let size = 0

    await mkdir(dirname(file), { recursive: true })
    try {
      await pipeline(
        input.body,
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            size += chunk.length
            if (size > input.maxBytes) {
              callback(new AppError(413, 'FILE_TOO_LARGE', '文件超过允许大小'))
              return
            }
            hash.update(chunk)
            callback(null, chunk)
          }
        }),
        createWriteStream(temp, { flags: 'wx' })
      )
      await rename(temp, file)
      return { key: input.key, size, sha256: hash.digest('hex') }
    } catch (err) {
      await rm(temp, { force: true })
      throw err
    }
  }

  async open(key: string, range?: OpenRange) {
    const file = this.path(key)
    try {
      await access(file)
      return createReadStream(file, range)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') throw new AppError(404, 'OBJECT_NOT_FOUND', '文件不存在')
      throw err
    }
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true })
  }

  async exists(key: string) {
    try {
      await access(this.path(key))
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw err
    }
  }
}
