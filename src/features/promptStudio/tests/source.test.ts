import { describe, expect, it } from 'vitest'
import type { PromptStudioSource } from '../types'
import { createPromptSourceSnapshot, normalizePromptSource } from '../core/source'

describe('prompt studio source', () => {
  it('normalizes copied source data without changing the input', () => {
    const source: PromptStudioSource = {
      type: 'conversation',
      id: ' conversation-1 ',
      title: ' 新品视觉 ',
      text: '第一行\r\n第二行',
      messages: [{ id: ' message-1 ', role: 'user', content: '需求\r补充', createdAt: 10 }],
      assets: [{
        id: ' asset-1 ',
        type: 'image',
        dataUrl: 'data:image/png;base64,abc',
        label: ' 主体参考 ',
        role: 'subject',
      }],
      metadata: { width: 1024, transparent: false },
    }

    const normalized = normalizePromptSource(source)

    expect(normalized).toEqual({
      type: 'conversation',
      id: 'conversation-1',
      title: '新品视觉',
      text: '第一行\n第二行',
      messages: [{ id: 'message-1', role: 'user', content: '需求\n补充', createdAt: 10 }],
      assets: [{
        id: 'asset-1',
        type: 'image',
        dataUrl: 'data:image/png;base64,abc',
        label: '主体参考',
        role: 'subject',
      }],
      metadata: { width: 1024, transparent: false },
    })
    expect(normalized.messages).not.toBe(source.messages)
    expect(normalized.assets).not.toBe(source.assets)
    expect(normalized.metadata).not.toBe(source.metadata)
    expect(source.id).toBe(' conversation-1 ')
  })

  it('creates a persistent snapshot without data URLs and fills stored dimensions', () => {
    const source: PromptStudioSource = {
      type: 'task',
      assets: [
        {
          id: 'asset-1',
          type: 'image',
          dataUrl: 'data:image/png;base64,secret',
          label: '主体参考',
          role: 'subject',
        },
        {
          id: 'asset-2',
          type: 'image',
          dataUrl: 'data:image/jpeg;base64,secret-2',
          label: '风格参考',
        },
      ],
    }

    const snapshot = createPromptSourceSnapshot(source, [
      { id: 'asset-1', type: 'image', label: '旧标签', width: 1200, height: 800 },
      { id: 'unrelated', type: 'image', label: '无关素材', width: 1, height: 1 },
    ])

    expect(snapshot.assets).toEqual([
      {
        id: 'asset-1',
        type: 'image',
        label: '主体参考',
        role: 'subject',
        width: 1200,
        height: 800,
      },
      {
        id: 'asset-2',
        type: 'image',
        label: '风格参考',
      },
    ])
    expect(JSON.stringify(snapshot)).not.toContain('dataUrl')
    expect(JSON.stringify(snapshot)).not.toContain('secret')
  })
})
