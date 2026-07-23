import { describe, expect, it } from 'vitest'
import { toPlainText, toSrt, toVtt } from './subtitleFormat'

const segments = [
  { id: 4, start: 0, end: 1.234, text: ' 你好 ' },
  { id: 8, start: 61.5, end: 3661.009, text: '世界' },
]

describe('subtitle formats', () => {
  it('生成 UTF-8 SRT 内容和连续序号', () => {
    expect(toSrt(segments)).toBe([
      '1\n00:00:00,000 --> 00:00:01,234\n你好',
      '2\n00:01:01,500 --> 01:01:01,009\n世界',
    ].join('\n\n'))
  })

  it('生成 VTT 和纯文本', () => {
    expect(toVtt(segments)).toContain('WEBVTT\n\n00:00:00.000 --> 00:00:01.234\n你好')
    expect(toPlainText(segments)).toBe('你好\n世界')
  })
})
