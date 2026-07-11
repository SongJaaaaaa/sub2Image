import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PromptCache, RemotePrompt } from '../types'

const dbMocks = vi.hoisted(() => ({
  getAllPromptCaches: vi.fn<() => Promise<PromptCache[]>>(),
  putPromptCache: vi.fn(),
}))

vi.mock('./db', () => dbMocks)

import { refreshPromptLibrary } from './promptLibrary'

const cachedImgEdify: RemotePrompt = {
  id: 'awesome-gpt4o-image-prompts-cached',
  title: '缓存中的提示词',
  prompt: 'cached prompt',
  coverUrl: '',
  tags: ['缓存'],
  model: 'GPT-4o',
  source: 'awesome-gpt4o-image-prompts',
  sourceUrl: 'https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts',
  license: 'MIT',
}

const responses = {
  'awesome-gpt-image': `
## 插画
### 春日咖啡馆
**提示词:**
\`\`\`text
画一间春日咖啡馆。
\`\`\`
`,
  'youmind-gpt-image-2': `
### No. 1: 产品摄影 - 香水
#### 📝 提示词
\`\`\`text
透明香水瓶产品摄影。
\`\`\`
`,
  'youmind-nano-banana-pro': `
### No. 1: 信息图 - 咖啡
#### 📝 提示词
\`\`\`text
制作咖啡信息图。
\`\`\`
`,
  'davidwu-gpt-image2-prompts': JSON.stringify([{
    id: 1,
    title_cn: '电影感肖像',
    prompt: 'A cinematic portrait.',
  }]),
}

beforeEach(() => {
  dbMocks.getAllPromptCaches.mockReset()
  dbMocks.putPromptCache.mockReset()
  dbMocks.getAllPromptCaches.mockResolvedValue([{
    id: 'awesome-gpt4o-image-prompts',
    items: [cachedImgEdify],
    updatedAt: 1,
  }])
  dbMocks.putPromptCache.mockResolvedValue('ok')

  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('ImgEdify')) {
      return new Response('network error', { status: 503, statusText: 'Unavailable' })
    }
    const entry = Object.entries(responses).find(([id]) => url.includes(
      id === 'awesome-gpt-image' ? 'ZeroLu' :
      id === 'youmind-gpt-image-2' ? 'awesome-gpt-image-2' :
      id === 'youmind-nano-banana-pro' ? 'awesome-nano-banana-pro-prompts' :
      'davidwuw0811-boop',
    ))
    return new Response(entry?.[1] || '', { status: entry ? 200 : 404 })
  }))
})

describe('refreshPromptLibrary', () => {
  it('keeps the failed source cache while returning other successful sources', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await refreshPromptLibrary()

    expect(result.failedSources).toEqual(['awesome-gpt4o-image-prompts'])
    expect(result.items).toHaveLength(5)
    expect(result.items).toContainEqual(cachedImgEdify)
    expect(new Set(result.items.map((item) => item.source))).toEqual(new Set([
      'awesome-gpt-image',
      'awesome-gpt4o-image-prompts',
      'youmind-gpt-image-2',
      'youmind-nano-banana-pro',
      'davidwu-gpt-image2-prompts',
    ]))
    expect(dbMocks.putPromptCache).toHaveBeenCalledTimes(4)
    expect(warn).toHaveBeenCalledWith(
      '提示词来源加载失败: awesome-gpt4o-image-prompts',
      expect.any(Error),
    )

    warn.mockRestore()
  })
})
