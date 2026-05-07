import type { TextLayer } from '../types/editor'

function applyFont(ctx: CanvasRenderingContext2D, layer: TextLayer): void {
  ctx.font = `${layer.fontStyle} ${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`
  ctx.fillStyle = layer.color
  ctx.textBaseline = 'top'
}

function drawHorizontal(ctx: CanvasRenderingContext2D, layer: TextLayer): void {
  let cursorX = 0

  for (const char of layer.content) {
    ctx.fillText(char, cursorX, 0)
    cursorX += ctx.measureText(char).width + layer.letterSpacing
  }
}

function drawVertical(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  direction: 'vertical_down' | 'vertical_up',
): void {
  const chars = layer.content.split('')
  const step = layer.fontSize * layer.lineHeight + layer.letterSpacing

  if (direction === 'vertical_down') {
    chars.forEach((char, index) => {
      ctx.fillText(char, 0, index * step)
    })
    return
  }

  chars.forEach((char, index) => {
    ctx.fillText(char, 0, -index * step)
  })
}

export function renderTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer): void {
  if (!layer.visible || layer.opacity <= 0 || !layer.content) return

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100))
  ctx.translate(layer.x, layer.y)
  ctx.rotate((layer.rotation * Math.PI) / 180)

  applyFont(ctx, layer)

  if (layer.direction === 'horizontal') {
    drawHorizontal(ctx, layer)
  } else {
    drawVertical(ctx, layer, layer.direction)
  }

  ctx.restore()
}
