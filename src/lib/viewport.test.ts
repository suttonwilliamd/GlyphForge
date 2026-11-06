import { describe, expect, it } from 'vitest'
import { constrainPosition, getViewport, toDocument, toViewport } from './viewport'

const document = { width: 1000, height: 700 }
const zero = { x: 0, y: 0 }

describe('document viewport coordinates', () => {
  it.each([
    { width: 366, height: 422 },
    { width: 820, height: 240 },
    { width: 1200, height: 760 },
  ])('fits the entire document with a reachable edge handle in %o', (size) => {
    const view = getViewport(document, size, 1, zero)
    const start = toViewport(zero, view)
    const end = toViewport({ x: 1000, y: 700 }, view)
    expect(start.x).toBeGreaterThanOrEqual(24)
    expect(start.y).toBeGreaterThanOrEqual(24)
    expect(end.x).toBeLessThanOrEqual(size.width - 24)
    expect(end.y).toBeLessThanOrEqual(size.height - 24)
  })

  it.each([1, 1.25, 2, 4])('round trips logical coordinates at zoom %s with pan', (zoom) => {
    const view = getViewport(document, { width: 366, height: 422 }, zoom, { x: -50, y: 70 })
    const point = { x: 345.25, y: 267.75 }
    const actual = toDocument(toViewport(point, view), view)
    expect(actual.x).toBeCloseTo(point.x)
    expect(actual.y).toBeCloseTo(point.y)
  })

  it('maps screen deltas to logical movement without a grab-offset jump', () => {
    const view = getViewport(document, { width: 366, height: 422 }, 2, { x: -30, y: 12 })
    const position = { x: 140, y: 130 }
    const handle = toViewport(position, view)
    const grabbed = toDocument({ x: handle.x + 10, y: handle.y - 8 }, view)
    const offset = { x: grabbed.x - position.x, y: grabbed.y - position.y }
    const moved = toDocument({ x: handle.x + 10 + 31.8, y: handle.y - 8 + 63.6 }, view)
    expect(constrainPosition({ x: moved.x - offset.x, y: moved.y - offset.y }, document)).toEqual({ x: 190, y: 230 })
  })

  it('resizes and refits without changing a document position', () => {
    const position = { x: 740, y: 620 }
    const portrait = getViewport(document, { width: 366, height: 422 }, 3, { x: -200, y: -100 })
    const landscape = getViewport(document, { width: 820, height: 240 }, 3, portrait.pan)
    const fit = getViewport(document, { width: 820, height: 240 }, 1, zero)
    for (const view of [portrait, landscape, fit]) {
      const result = toDocument(toViewport(position, view), view)
      expect(result.x).toBeCloseTo(position.x)
      expect(result.y).toBeCloseTo(position.y)
    }
  })

  it('bounds zoom and pan, including returning to fit', () => {
    const size = { width: 366, height: 422 }
    const minimum = getViewport(document, size, -10, { x: 9999, y: -9999 })
    const fit = getViewport(document, size, 1, zero)
    expect(minimum.origin).toEqual(fit.origin)
    expect(minimum.scale).toBe(fit.scale)
    expect(minimum.pan.x).toBeCloseTo(0)
    expect(minimum.pan.y).toBeCloseTo(0)
    const maximum = getViewport(document, size, 4, { x: 9999, y: -9999 })
    expect(getViewport(document, size, 100, { x: 9999, y: -9999 })).toEqual(maximum)
    expect(maximum.origin.x).toBeCloseTo(24)
    expect(maximum.origin.y + document.height * maximum.scale).toBeCloseTo(size.height - 24)
  })

  it('clamps placement at every document boundary and rounds logical pixels', () => {
    expect(constrainPosition({ x: -100, y: 9999 }, document)).toEqual({ x: 0, y: 700 })
    expect(constrainPosition({ x: 1001, y: -1 }, document)).toEqual({ x: 1000, y: 0 })
    expect(constrainPosition({ x: 140.4, y: 130.6 }, document)).toEqual({ x: 140, y: 131 })
  })
})
