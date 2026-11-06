import type { EditorState } from '../types/editor'
import { renderTextLayer } from './renderTextLayer'

export function renderDocument(canvas: HTMLCanvasElement, state: EditorState): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas rendering is unavailable in this browser.')
  ctx.clearRect(0, 0, state.document.width, state.document.height)
  ctx.fillStyle = state.document.background
  ctx.fillRect(0, 0, state.document.width, state.document.height)
  state.layers.forEach((layer) => renderTextLayer(ctx, layer))
}

export async function exportPng(state: EditorState): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = state.document.width
  canvas.height = state.document.height
  renderDocument(canvas, state)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The browser could not encode this PNG.')), 'image/png')
  })
}

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    // Let the browser begin consuming the URL before releasing its backing Blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
