import type { TextDirection } from '../types/editor'

export interface GlyphPlacement {
  char: string
  x: number
  y: number
}

export interface LayoutInput {
  content: string
  direction: TextDirection
  letterSpacing: number
  fontSize: number
  lineHeight: number
  measureCharWidth?: (char: string) => number
}

export function computeGlyphPlacements(input: LayoutInput): GlyphPlacement[] {
  const {
    content,
    direction,
    letterSpacing,
    fontSize,
    lineHeight,
    measureCharWidth = () => fontSize * 0.6,
  } = input

  if (!content) return []

  if (direction === 'horizontal') {
    let cursorX = 0
    let cursorY = 0
    const stepY = fontSize * lineHeight
    const placements: GlyphPlacement[] = []

    for (const char of Array.from(content)) {
      if (char === '\n') {
        cursorX = 0
        cursorY += stepY
        continue
      }

      placements.push({ char, x: cursorX, y: cursorY })
      cursorX += measureCharWidth(char) + letterSpacing
    }

    return placements
  }

  const step = fontSize * lineHeight + letterSpacing
  const sign = direction === 'vertical_down' ? 1 : -1

  return Array.from(content).map((char, index) => ({
    char,
    x: 0,
    y: index === 0 ? 0 : index * step * sign,
  }))
}
