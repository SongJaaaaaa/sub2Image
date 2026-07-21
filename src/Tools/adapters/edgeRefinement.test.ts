import { describe, expect, it } from 'vitest'
import { refineEdgePixels } from './edgeRefinement'

function pixels(values: Array<[number, number, number, number]>) {
  return new Uint8ClampedArray(values.flat())
}

describe('edge refinement', () => {
  it('expands and tightens semi-transparent edges without changing endpoints', () => {
    const source = pixels([
      [0, 0, 0, 0],
      [0, 0, 0, 128],
      [0, 0, 0, 255],
    ])

    const expanded = refineEdgePixels(source, 3, 1, { shift: -20, feather: 0, decontaminate: 0 })
    const tightened = refineEdgePixels(source, 3, 1, { shift: 20, feather: 0, decontaminate: 0 })

    expect([expanded[3], expanded[7], expanded[11]]).toEqual([0, 139, 255])
    expect([tightened[3], tightened[7], tightened[11]]).toEqual([0, 117, 255])
  })

  it('softens the alpha edge with a box blur', () => {
    const source = pixels([
      [0, 0, 0, 0],
      [0, 0, 0, 255],
      [0, 0, 0, 0],
    ])
    const output = refineEdgePixels(source, 3, 1, { shift: 0, feather: 1, decontaminate: 0 })

    expect([output[3], output[7], output[11]]).toEqual([128, 85, 128])
  })

  it('pulls color from more opaque neighbors to reduce edge spill', () => {
    const source = pixels([
      [200, 20, 20, 255],
      [255, 255, 255, 100],
      [200, 20, 20, 255],
    ])
    const output = refineEdgePixels(source, 3, 1, { shift: 0, feather: 0, decontaminate: 100 })

    expect(output[4]).toBeLessThan(255)
    expect(output[5]).toBeLessThan(100)
    expect(output[6]).toBeLessThan(100)
    expect(output[7]).toBe(100)
  })
})
