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
    return Array.from(content).map((char) => {
      const placement = { char, x: cursorX, y: 0 }
      cursorX += measureCharWidth(char) + letterSpacing
      return placement
    })
  }

  const step = fontSize * lineHeight + letterSpacing
  const sign = direction === 'vertical_down' ? 1 : -1

  return Array.from(content).map((char, index) => ({
    char,
    x: 0,
    y: index === 0 ? 0 : index * step * sign,
  }))
}
