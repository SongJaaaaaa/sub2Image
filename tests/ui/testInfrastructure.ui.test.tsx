// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { indexedDB } from 'fake-indexeddb'
import { afterEach, describe, expect, it } from 'vitest'

function InputFixture() {
  const [value, setValue] = useState('')
  return <input aria-label="测试输入" value={value} onChange={(e) => setValue(e.target.value)} />
}

afterEach(cleanup)

describe('WP0 test infrastructure', () => {
  it('runs React Testing Library and user-event in a per-file jsdom environment', async () => {
    render(<InputFixture />)
    const input = screen.getByRole('textbox', { name: '测试输入' }) as HTMLInputElement

    await userEvent.type(input, '中文输入')

    expect(input.value).toBe('中文输入')
  })

  it('runs an IndexedDB transaction with fake-indexeddb', async () => {
    const name = `wp0-${Date.now()}-${Math.random()}`
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 1)
      req.onupgradeneeded = () => req.result.createObjectStore('items')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    const tx = db.transaction('items', 'readwrite')
    tx.objectStore('items').put('可恢复', 'state')
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })

    const value = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction('items').objectStore('items').get('state')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    expect(value).toBe('可恢复')
    db.close()
    indexedDB.deleteDatabase(name)
  })
})
