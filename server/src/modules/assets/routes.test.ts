import { describe, expect, it } from 'vitest'

import { parseRange } from './routes.js'

describe('parseRange', () => {
  it('解析普通、开放和后缀范围', () => {
    expect(parseRange(undefined, 100)).toBeNull()
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 })
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
  })

  it('拒绝越界和多段范围', () => {
    expect(() => parseRange('bytes=100-110', 100)).toThrow('请求范围无效')
    expect(() => parseRange('bytes=0-1,3-4', 100)).toThrow('请求范围无效')
  })
})
