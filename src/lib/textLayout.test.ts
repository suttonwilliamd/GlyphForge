import { describe, expect, it } from 'vitest'
import { computeGlyphPlacements } from './textLayout'

describe('computeGlyphPlacements', () => {
  it('renders horizontal text with spacing', () => {
    const placements = computeGlyphPlacements({
      content: 'ABC',
      direction: 'horizontal',
      letterSpacing: 4,
      fontSize: 20,
      lineHeight: 1.2,
      measureCharWidth: () => 10,
    })

    expect(placements).toEqual([
      { char: 'A', x: 0, y: 0 },
      { char: 'B', x: 14, y: 0 },
      { char: 'C', x: 28, y: 0 },
    ])
  })

  it('supports negative letter spacing horizontally', () => {
    const placements = computeGlyphPlacements({
      content: 'ABC',
      direction: 'horizontal',
      letterSpacing: -2,
      fontSize: 20,
      lineHeight: 1,
      measureCharWidth: () => 10,
    })

    expect(placements.map((p) => p.x)).toEqual([0, 8, 16])
  })

  it('renders vertical down with line-height step', () => {
    const placements = computeGlyphPlacements({
      content: 'HEY',
      direction: 'vertical_down',
      letterSpacing: 2,
      fontSize: 30,
      lineHeight: 1.1,
    })

    expect(placements).toEqual([
      { char: 'H', x: 0, y: 0 },
      { char: 'E', x: 0, y: 35 },
      { char: 'Y', x: 0, y: 70 },
    ])
  })

  it('renders vertical up with negative y progression', () => {
    const placements = computeGlyphPlacements({
      content: 'UP',
      direction: 'vertical_up',
      letterSpacing: 0,
      fontSize: 40,
      lineHeight: 1,
    })

    expect(placements).toEqual([
      { char: 'U', x: 0, y: 0 },
      { char: 'P', x: 0, y: -40 },
    ])
  })

  it('handles empty content', () => {
    const placements = computeGlyphPlacements({
      content: '',
      direction: 'horizontal',
      letterSpacing: 0,
      fontSize: 24,
      lineHeight: 1,
    })

    expect(placements).toEqual([])
  })

  it('handles multiline characters as regular glyphs', () => {
    const placements = computeGlyphPlacements({
      content: 'A\nB',
      direction: 'horizontal',
      letterSpacing: 0,
      fontSize: 16,
      lineHeight: 1,
      measureCharWidth: () => 10,
    })

    expect(placements).toHaveLength(3)
    expect(placements[1].char).toBe('\n')
  })

  it('handles long strings without dropping glyphs', () => {
    const content = 'X'.repeat(500)
    const placements = computeGlyphPlacements({
      content,
      direction: 'vertical_down',
      letterSpacing: 1,
      fontSize: 12,
      lineHeight: 1.2,
    })

    expect(placements).toHaveLength(500)
    expect(placements[499].y).toBeCloseTo(499 * 15.4)
  })
})
