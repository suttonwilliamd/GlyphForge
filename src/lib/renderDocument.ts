import type { EditorState } from '../types/editor'
import { renderTextLayer } from './renderTextLayer'

export function renderDocument(ctx: CanvasRenderingContext2D, state: EditorState): void {
  ctx.clearRect(0, 0, state.document.width, state.document.height)
  ctx.fillStyle = state.document.background
  ctx.fillRect(0, 0, state.document.width, state.document.height)
  state.layers.forEach((layer) => renderTextLayer(ctx, layer))
}

export function clampCoordinate(value: number, maximum: number): number | null {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : null
}
