import type { EditorState } from '../types/editor'
import { renderDocument } from './renderDocument'

/** Capture the click-time document, never the DOM overlay or display-scaled canvas. */
export async function exportPng(state: EditorState): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = state.document.width
  canvas.height = state.document.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas rendering is unavailable.')

  // Explicitly request the actual fonts used by visible text before measuring glyphs.
  await Promise.all(state.layers.filter((layer) => layer.visible && layer.opacity > 0 && layer.content)
    .map((layer) => document.fonts.load(
      `${layer.fontStyle} ${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`, layer.content,
    )))
  await document.fonts.ready
  renderDocument(ctx, state)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG encoding returned no image.')), 'image/png')
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  try {
    anchor.href = url
    anchor.download = `glyphforge-${canvas.width}x${canvas.height}.png`
    document.body.append(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    // Give the browser time to consume the URL; immediate revocation can cancel a download.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
