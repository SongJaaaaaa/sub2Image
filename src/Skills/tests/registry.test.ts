import { afterEach, describe, expect, it } from 'vitest'
import {
  agentSkills,
  defineAgentSkills,
  getUploadedAgentSkillDoc,
  importAgentSkill,
  parseAgentSkill,
  removeAgentSkill,
  restoreAgentSkill,
} from '../registry'

const skill = {
  id: 'product-photography',
  name: '电商产品图',
  description: '生成产品摄影提示词',
  version: 1,
  author: 'Example',
  source: 'https://example.com/skill',
  license: 'MIT',
  order: 10,
  instructions: '输出商品主图提示词',
}

const uploadedRaw = `---
id: custom-product-photo
name: 自定义产品图
description: 使用自定义流程生成产品图
version: 1
author: User
source: https://example.com/custom-skill
license: MIT
order: 50
---
先分析产品卖点，再生成图片。`

function createFile(name: string, raw: string | Uint8Array) {
  const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as File
}

describe('Agent Skill registry', () => {
  afterEach(() => removeAgentSkill('custom-product-photo'))

  it('loads the six built-in skills in display order', () => {
    expect(agentSkills.map((item) => item.id)).toEqual([
      'product-photography',
      'character-consistency',
      'image-editing',
      'poster-design',
      'storyboard',
      'video-prompting',
    ])
  })

  it('rejects duplicate ids', () => {
    expect(() => defineAgentSkills([skill, { ...skill }])).toThrow('Agent Skill ID 重复：product-photography')
  })

  it('parses a single markdown skill file', () => {
    const raw = `---
id: product-photography
name: 电商产品图
description: 生成产品摄影提示词
version: 1
author: Example
source: https://example.com/skill
license: MIT
order: 10
---
生成商品主图。`
    expect(parseAgentSkill(raw)).toEqual({ ...skill, instructions: '生成商品主图。' })
  })

  it('imports one UTF-8 Markdown Skill', async () => {
    const imported = await importAgentSkill(createFile('custom-skill.md', uploadedRaw))

    expect(imported).toMatchObject({
      id: 'custom-product-photo',
      name: '自定义产品图',
      uploaded: true,
      fileName: 'custom-skill.md',
    })
    expect(agentSkills.some((item) => item.id === imported.id)).toBe(true)
  })

  it('restores a cloud Skill and only overwrites it explicitly', () => {
    const restored = restoreAgentSkill(uploadedRaw, 'cloud-skill.md')
    const updatedRaw = uploadedRaw
      .replace('version: 1', 'version: 2')
      .replace('先分析产品卖点，再生成图片。', '使用云端新版流程。')

    expect(restored).toMatchObject({ id: 'custom-product-photo', uploaded: true })
    expect(getUploadedAgentSkillDoc(restored.id)?.raw).toBe(uploadedRaw)
    expect(() => restoreAgentSkill(updatedRaw, 'cloud-skill.md')).toThrow('Skill ID 已存在：custom-product-photo')

    expect(restoreAgentSkill(updatedRaw, 'cloud-skill.md', true)).toMatchObject({
      id: 'custom-product-photo',
      version: 2,
    })
    expect(getUploadedAgentSkillDoc(restored.id)?.raw).toBe(updatedRaw)
  })

  it('only accepts .md files', async () => {
    await expect(importAgentSkill(createFile('custom-skill.txt', uploadedRaw))).rejects.toThrow('只能上传 .md 文件')
  })

  it('rejects invalid UTF-8 files', async () => {
    await expect(importAgentSkill(createFile('custom-skill.md', new Uint8Array([0xff])))).rejects.toThrow('必须是有效的 UTF-8 文本')
  })

  it('rejects unsafe source URLs and duplicate ids', async () => {
    await expect(importAgentSkill(createFile(
      'unsafe.md',
      uploadedRaw.replace('https://example.com/custom-skill', 'javascript:alert(1)'),
    ))).rejects.toThrow('source 必须是 HTTP/HTTPS 地址')

    await importAgentSkill(createFile('custom-skill.md', uploadedRaw))
    await expect(importAgentSkill(createFile('duplicate.md', uploadedRaw))).rejects.toThrow('Skill ID 已存在：custom-product-photo')
  })
})
