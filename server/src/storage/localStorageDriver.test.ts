import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, describe, expect, it } from 'vitest'

import { AppError } from '../errors.js'
import { LocalStorageDriver } from './localStorageDriver.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function read(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

describe('LocalStorageDriver', () => {
  it('写入、读取和范围读取文件', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cloud-storage-'))
    dirs.push(dir)
    const storage = new LocalStorageDriver(dir)
    const body = Buffer.from('abcdef')

    const stored = await storage.put({
      key: 'account/objects/file',
      body: Readable.from(body),
      maxBytes: body.length
    })

    expect(stored).toEqual({
      key: 'account/objects/file',
      size: 6,
      sha256: 'bef57ec7f53a6d40beb640a780a639c83bc29ac8a9816f1fc6c5c6dcd93c4721'
    })
    expect(await storage.exists(stored.key)).toBe(true)
    expect((await read(await storage.open(stored.key))).toString()).toBe('abcdef')
    expect((await read(await storage.open(stored.key, { start: 1, end: 3 }))).toString()).toBe('bcd')
  })

  it('拒绝越界路径和超限文件', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cloud-storage-'))
    dirs.push(dir)
    const storage = new LocalStorageDriver(dir)

    await expect(storage.put({
      key: '../escape',
      body: Readable.from('x'),
      maxBytes: 1
    })).rejects.toMatchObject({ code: 'INVALID_OBJECT_KEY' })

    await expect(storage.put({
      key: 'account/large',
      body: Readable.from('too large'),
      maxBytes: 2
    })).rejects.toBeInstanceOf(AppError)
    expect(await storage.exists('account/large')).toBe(false)
  })

  it('启动时只清理驱动专属的随机临时文件', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cloud-storage-'))
    dirs.push(dir)
    const nested = join(dir, 'account', 'objects')
    await mkdir(nested, { recursive: true })

    const stale = join(nested, 'image.123e4567-e89b-42d3-a456-426614174000.tmp')
    const ordinary = join(nested, 'image.tmp')
    const wrongVersion = join(nested, 'image.123e4567-e89b-12d3-a456-426614174000.tmp')
    const suffix = join(nested, 'image.123e4567-e89b-42d3-a456-426614174000.tmp.keep')
    await Promise.all([
      writeFile(stale, 'stale'),
      writeFile(ordinary, 'ordinary'),
      writeFile(wrongVersion, 'business'),
      writeFile(suffix, 'keep')
    ])

    const storage = new LocalStorageDriver(dir)
    await expect(storage.cleanupTempFiles()).resolves.toBe(1)
    await expect(access(stale)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(ordinary, 'utf8')).resolves.toBe('ordinary')
    await expect(readFile(wrongVersion, 'utf8')).resolves.toBe('business')
    await expect(readFile(suffix, 'utf8')).resolves.toBe('keep')
  })
})
