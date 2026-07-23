import { describe, expect, it } from 'vitest'
import { fitSubtitles, getActiveSubtitle, parseSubtitle } from '../lib/subtitleTrack'
import { wrapSubtitleText } from '../lib/subtitleRender'

describe('video subtitle track', () => {
  it('parses SRT timestamps and multiline text', () => {
    const cues = parseSubtitle(`1
00:00:01,200 --> 00:00:03,400
第一行
第二行

2
00:00:04,000 --> 00:00:05,500
下一条
`)

    expect(cues).toEqual([
      { id: 'subtitle-1', start: 1.2, end: 3.4, text: '第一行\n第二行' },
      { id: 'subtitle-2', start: 4, end: 5.5, text: '下一条' },
    ])
  })

  it('parses VTT cue settings and removes inline tags', () => {
    const cues = parseSubtitle(`WEBVTT

intro
00:01.000 --> 00:03.250 align:center
<b>Hello</b> world
`)

    expect(cues).toEqual([{ id: 'subtitle-1', start: 1, end: 3.25, text: 'Hello world' }])
  })

  it('clips imported cues to project duration and finds the active cue', () => {
    const cues = fitSubtitles([
      { id: 'subtitle-1', start: -1, end: 1.5, text: '开头' },
      { id: 'subtitle-2', start: 4, end: 8, text: '结尾' },
      { id: 'subtitle-3', start: 9, end: 10, text: '超出' },
    ], 6)

    expect(cues).toEqual([
      { id: 'subtitle-1', start: 0, end: 1.5, text: '开头' },
      { id: 'subtitle-2', start: 4, end: 6, text: '结尾' },
    ])
    expect(getActiveSubtitle(cues, 4.2)?.text).toBe('结尾')
    expect(getActiveSubtitle(cues, 6)).toBeUndefined()
  })

  it('wraps Chinese text using measured width', () => {
    expect(wrapSubtitleText('一二三四五', 3, (value) => value.length)).toEqual(['一二三', '四五'])
  })
})
