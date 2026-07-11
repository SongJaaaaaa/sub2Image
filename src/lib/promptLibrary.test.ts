import { describe, expect, it } from 'vitest'
import type { RemotePrompt } from '../types'
import {
  PROMPT_SOURCES,
  filterPromptLibrary,
  parseAwesomeGpt4o,
  parseAwesomeGptImage,
  parseDavidWu,
  parseYouMind,
} from './promptLibrary'

describe('prompt library parsers', () => {
  it('parses ZeroLu markdown with Chinese text and a relative HTML image', () => {
    const markdown = `
## 插画 / 海报

### 春日咖啡馆
<img src="assets/cafe.png" alt="咖啡馆">

**提示词:**
\`\`\`text
画一间开满鲜花的春日咖啡馆，暖色阳光。
\`\`\`
`

    const [item] = parseAwesomeGptImage(markdown)

    expect(item).toMatchObject({
      title: '春日咖啡馆',
      prompt: '画一间开满鲜花的春日咖啡馆，暖色阳光。',
      coverUrl: 'https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main/assets/cafe.png',
      tags: ['插画', '海报'],
      source: 'awesome-gpt-image',
    })
  })

  it('parses ImgEdify markdown fields', () => {
    const markdown = `
### 复古旅行海报
- **模型：** gpt4o
- **提示词文本：** \`Create a retro travel poster for Shanghai.\`
- **示例图片：**
![preview](images/shanghai.jpg)
`

    const [item] = parseAwesomeGpt4o(markdown)

    expect(item).toMatchObject({
      title: '复古旅行海报',
      prompt: 'Create a retro travel poster for Shanghai.',
      coverUrl: 'https://raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main/images/shanghai.jpg',
      tags: ['gpt4o'],
      model: 'GPT-4o',
    })
  })

  it('parses both YouMind repositories with their own source metadata', () => {
    const markdown = `
### No. 1: 产品摄影 - 透明香水瓶
![preview](assets/perfume.webp)
#### 📝 提示词
\`\`\`text
透明香水瓶置于水面，商业产品摄影。
\`\`\`
`

    const [gptItem] = parseYouMind(markdown, PROMPT_SOURCES[2])
    const [nanoItem] = parseYouMind(markdown, PROMPT_SOURCES[3])

    expect(gptItem).toMatchObject({
      title: '产品摄影 - 透明香水瓶',
      prompt: '透明香水瓶置于水面，商业产品摄影。',
      source: 'youmind-gpt-image-2',
      model: 'GPT Image 2',
      coverUrl: 'https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/assets/perfume.webp',
    })
    expect(nanoItem).toMatchObject({
      source: 'youmind-nano-banana-pro',
      model: 'Nano Banana Pro',
      coverUrl: 'https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main/assets/perfume.webp',
    })
  })

  it('parses davidwu JSON, tags and undeclared license', () => {
    const content = JSON.stringify([{
      id: 1,
      title_cn: '电影感人物肖像',
      title_en: 'Cinematic portrait',
      category_cn: '人物',
      category: 'portrait',
      author: 'David Wu',
      prompt: 'A cinematic portrait with dramatic rim light.',
      needs_ref: true,
      image: 'images/portrait.png',
    }])

    const [item] = parseDavidWu(content)

    expect(item).toMatchObject({
      id: 'davidwu-gpt-image2-prompts-0001',
      title: '电影感人物肖像',
      prompt: 'A cinematic portrait with dramatic rim light.',
      coverUrl: 'https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main/images/portrait.png',
      license: '许可证未声明',
    })
    expect(item.tags).toEqual(expect.arrayContaining(['人物', 'portrait', 'david wu', '需要参考图']))
  })
})

describe('filterPromptLibrary', () => {
  const items: RemotePrompt[] = [
    {
      id: 'one',
      title: '春日咖啡馆',
      prompt: '暖色阳光下的街角咖啡馆',
      coverUrl: '',
      tags: ['插画', '建筑'],
      model: 'GPT Image 2',
      source: 'awesome-gpt-image',
      sourceUrl: 'https://github.com/ZeroLu/awesome-gpt-image',
      license: 'MIT',
    },
    {
      id: 'two',
      title: '未来汽车',
      prompt: 'A silver concept car in a dark studio',
      coverUrl: '',
      tags: ['产品', '汽车'],
      model: 'GPT-4o',
      source: 'awesome-gpt4o-image-prompts',
      sourceUrl: 'https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts',
      license: 'MIT',
    },
  ]

  it.each([
    ['咖啡馆', 'one'],
    ['暖色阳光', 'one'],
    ['建筑', 'one'],
    ['ZeroLu', 'one'],
    ['GPT-4o', 'two'],
  ])('matches keyword %s', (query, id) => {
    expect(filterPromptLibrary(items, query, '', '').map((item) => item.id)).toEqual([id])
  })

  it('combines source and tag filters', () => {
    expect(filterPromptLibrary(items, '', 'awesome-gpt4o-image-prompts', '汽车').map((item) => item.id)).toEqual(['two'])
    expect(filterPromptLibrary(items, '', 'awesome-gpt-image', '汽车')).toEqual([])
  })
})
