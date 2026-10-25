// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportPng } from './exportPng'
import { clampCoordinate } from './renderDocument'
import type { EditorState } from '../types/editor'

const layer = {
  id: 'a', name: 'Text', type: 'text' as const, visible: true, locked: false,
  opacity: 100, x: 25, y: 35, rotation: 30, content: 'A\nB', fontFamily: 'Arial',
  fontSize: 20, fontWeight: 600, fontStyle: 'normal' as const, color: '#123456',
  lineHeight: 1.2, letterSpacing: -2, direction: 'horizontal' as const, keepUpright: true,
}
const state: EditorState = {
  document: { width: 1000, height: 700, background: '#abcdef' },
  layers: [layer, { ...layer, id: 'hidden', visible: false, content: 'HIDDEN' }], selectedLayerId: 'a',
}
const ctx = {
  clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
  translate: vi.fn(), rotate: vi.fn(), measureText: vi.fn(() => ({ width: 10 })),
  fillText: vi.fn(), fillStyle: '',
}
let encodedDimensions: { width: number; height: number }
let callback: BlobCallback
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb, type) {
    encodedDimensions = { width: this.width, height: this.height }
    expect(type).toBe('image/png')
    callback = cb
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  Object.defineProperty(document, 'fonts', { configurable: true, value: { load: vi.fn().mockResolvedValue([]), ready: Promise.resolve() } })
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
async function startEncoding() {
  const result = exportPng(state)
  await vi.waitFor(() => expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledOnce())
  return { result }
}

describe('PNG export contract (mocked canvas, not browser PNG acceptance)', () => {
  it('waits for fonts, renders document dimensions/background and only visible glyphs, cleans URL later', async () => {
    const { result } = await startEncoding()
    expect(document.fonts.load).toHaveBeenCalledWith('normal 600 20px Arial', 'A\nB')
    expect(encodedDimensions).toEqual({ width: 1000, height: 700 })
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1000, 700)
    // Background is assigned before text color; inspect at draw time below in a separate test.
    expect(ctx.fillText.mock.calls.map((call) => call[0])).toEqual(['A', 'B'])
    expect(ctx.translate).toHaveBeenCalledWith(25, 35)
    callback(new Blob(['mock'], { type: 'image/png' }))
    await result
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
    expect(document.querySelector('a')).toBeNull()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
  it('paints the requested solid background', async () => {
    ctx.fillRect.mockImplementationOnce(() => expect(ctx.fillStyle).toBe('#abcdef'))
    const { result } = await startEncoding()
    callback(new Blob())
    await result
  })
  it('rejects null blobs without creating a URL or clicking', async () => {
    const { result } = await startEncoding()
    const failure = expect(result).rejects.toThrow('no image')
    callback(null)
    await failure
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  })
  it('propagates encoding exceptions', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(() => { throw new Error('encoder broke') })
    await expect(exportPng(state)).rejects.toThrow('encoder broke')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('cleans up even when the browser refuses the download click', async () => {
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => { throw new Error('blocked click') })
    const { result } = await startEncoding()
    const failure = expect(result).rejects.toThrow('blocked click')
    callback(new Blob())
    await failure
    expect(document.querySelector('a')).toBeNull()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })
  it('propagates font failures without encoding or requesting a download', async () => {
    vi.mocked(document.fonts.load).mockRejectedValue(new Error('font unavailable'))
    await expect(exportPng(state)).rejects.toThrow('font unavailable')
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('does not render until the requested font loads', async () => {
    let ready!: () => void
    vi.mocked(document.fonts.load).mockImplementation(() => new Promise((resolve) => { ready = () => resolve([]) }))
    const result = exportPng(state)
    await Promise.resolve()
    expect(ctx.fillText).not.toHaveBeenCalled()
    ready()
    await vi.waitFor(() => expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalled())
    callback(new Blob())
    await result
  })
})

it('clamps finite positions and rejects nonfinite coordinates', () => {
  expect(clampCoordinate(-10, 1000)).toBe(0)
  expect(clampCoordinate(1200, 1000)).toBe(1000)
  expect(clampCoordinate(12.5, 700)).toBe(12.5)
  for (const value of [NaN, Infinity, -Infinity]) expect(clampCoordinate(value, 700)).toBeNull()
})
