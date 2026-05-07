import { computeGlyphPlacements } from './textLayout'
import type { TextLayer } from '../types/editor'

function applyFont(ctx: CanvasRenderingContext2D, layer: TextLayer): void {
  ctx.font = `${layer.fontStyle} ${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`
  ctx.fillStyle = layer.color
  ctx.textBaseline = 'top'
}

export function renderTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer): void {
  if (!layer.visible || layer.opacity <= 0 || !layer.content) return

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100))
  ctx.translate(layer.x, layer.y)
  ctx.rotate((layer.rotation * Math.PI) / 180)

  applyFont(ctx, layer)

  const placements = computeGlyphPlacements({
    content: layer.content,
    direction: layer.direction,
    letterSpacing: layer.letterSpacing,
    fontSize: layer.fontSize,
    lineHeight: layer.lineHeight,
    measureCharWidth: (char) => ctx.measureText(char).width,
  })

  placements.forEach((placement) => {
    ctx.fillText(placement.char, placement.x, placement.y)
  })

  ctx.restore()
}
