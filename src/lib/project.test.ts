import { describe, expect, it } from 'vitest'
import type { EditorState } from '../types/editor'
import { createProjectImporter, decodeProject, encodeProject, MAX_CONTENT_LENGTH, MAX_PROJECT_BYTES } from './project'

function composition(): EditorState {
  return {
    document: { width: 1000, height: 700, background: '#decafe' },
    selectedLayerId: 'custom-id',
    layers: [{
      id: 'custom-id', name: 'Portable text', type: 'text', visible: true, locked: false,
      opacity: 76.5, x: 123.25, y: 456.75, rotation: -47, content: 'Glyph 🌻\n漢字',
      fontFamily: 'Georgia, serif', fontSize: 89, fontWeight: 700, fontStyle: 'italic',
      color: '#123aBc', lineHeight: 1.7, letterSpacing: -3, direction: 'vertical_up', keepUpright: true,
    }],
  }
}

function source(change: (project: Record<string, unknown>) => void): string {
  const project = JSON.parse(encodeProject(composition()))
  change(project)
  return JSON.stringify(project)
}

function deferredFile() {
  // Node 18 and the app's ES2020 target do not provide Promise.withResolvers.
  let resolve!: (source: string) => void
  let reject!: (error: Error) => void
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej })
  return { file: { size: 100, text: () => promise }, resolve, reject }
}

describe('portable GlyphForge project', () => {
  it('roundtrips every document and text property without view state', () => {
    const original = composition()
    const encoded = encodeProject(original)
    expect(decodeProject(encoded)).toEqual(original)
    expect(JSON.parse(encoded)).toEqual({ format: 'GlyphForge', version: 1, ...original })
    expect(decodeProject(encoded)).not.toBe(original)
  })

  it.each([
    ['foreign format', (p: Record<string, unknown>) => { p.format = 'OtherEditor' }],
    ['future version', (p: Record<string, unknown>) => { p.version = 2 }],
    ['missing version', (p: Record<string, unknown>) => { delete p.version }],
    ['unknown field', (p: Record<string, unknown>) => { p.viewport = { zoom: 2 } }],
    ['empty layers', (p: Record<string, unknown>) => { p.layers = [] }],
    ['multiple layers', (p: Record<string, unknown>) => { const layers = p.layers as unknown[]; layers.push(layers[0]) }],
    ['bad selection', (p: Record<string, unknown>) => { p.selectedLayerId = null }],
    ['different dimensions', (p: Record<string, unknown>) => { (p.document as Record<string, unknown>).width = 2000 }],
    ['missing background', (p: Record<string, unknown>) => { delete (p.document as Record<string, unknown>).background }],
  ])('rejects %s instead of discarding unsupported data', (_label, change) => {
    expect(() => decodeProject(source(change))).toThrow('Invalid GlyphForge project')
  })

  it.each([
    ['type', 'image'], ['locked', true], ['visible', 'true'], ['keepUpright', 1],
    ['content', 'x'.repeat(MAX_CONTENT_LENGTH + 1)], ['fontFamily', 'x'.repeat(201)],
    ['name', ''], ['id', ''], ['opacity', 101], ['x', -1], ['y', 701], ['rotation', 181],
    ['fontSize', 181], ['fontSize', 7], ['fontWeight', 1001], ['lineHeight', 0],
    ['letterSpacing', -11], ['direction', 'diagonal'], ['fontStyle', 'bold'], ['color', 'red'],
    ['unexpected', true], ['opacity', null],
  ])('rejects unsafe or unsupported layer %s=%s', (key, value) => {
    expect(() => decodeProject(source((p) => { (p.layers as Record<string, unknown>[])[0][key] = value }))).toThrow()
  })

  it('checks finite numbers even when valid JSON overflows to Infinity', () => {
    const encoded = encodeProject(composition()).replace('123.25', '1e999')
    expect(() => decodeProject(encoded)).toThrow('finite number')
    const state = composition()
    state.layers[0].fontSize = NaN
    expect(() => encodeProject(state)).toThrow('finite number')
  })

  it('accepts documented boundaries including empty content and fractional position', () => {
    const state = composition()
    Object.assign(state.layers[0], { content: '', fontFamily: '', x: 1000, y: 0, fontSize: 8, opacity: 0, letterSpacing: 60, rotation: -180 })
    expect(decodeProject(encodeProject(state))).toEqual(state)
    state.layers[0].content = '🌻'.repeat(MAX_CONTENT_LENGTH / 2)
    expect(decodeProject(encodeProject(state))).toEqual(state)
  })

  it('rejects malformed JSON and oversized UTF-8 before accepting state', () => {
    expect(() => decodeProject('{')).toThrow('not valid JSON')
    expect(() => decodeProject('🌻'.repeat(MAX_PROJECT_BYTES / 4 + 1))).toThrow('bytes')
  })
})

describe('project import transactions', () => {
  it('keeps current composition untouched on validation and read failure', async () => {
    const importer = createProjectImporter()
    let current = composition()
    const original = structuredClone(current)
    const replace = async (file: Pick<File, 'size' | 'text'>) => {
      const next = await importer.load(file)
      if (next) current = next
    }
    await expect(replace({ size: 2, text: async () => '{}' })).rejects.toThrow()
    await expect(replace({ size: 1, text: async () => { throw new Error('Disk unavailable') } })).rejects.toThrow('Disk unavailable')
    let read = false
    await expect(replace({ size: MAX_PROJECT_BYTES + 1, text: async () => { read = true; return '' } })).rejects.toThrow('bytes')
    expect(read).toBe(false)
    expect(current).toEqual(original)
  })

  it('allows only the newest selected file to replace the document', async () => {
    const importer = createProjectImporter()
    const old = deferredFile()
    const first = importer.load(old.file)
    const next = composition()
    next.layers[0].content = 'Newest'
    expect(await importer.load({ size: 100, text: async () => encodeProject(next) })).toEqual(next)
    old.resolve(encodeProject(composition()))
    expect(await first).toBeNull()
  })

  it('suppresses stale errors and explicit cancellation from edits or unmount', async () => {
    const importer = createProjectImporter()
    const old = deferredFile()
    const first = importer.load(old.file)
    const next = deferredFile()
    const second = importer.load(next.file)
    old.reject(new Error('stale failure'))
    expect(await first).toBeNull()
    expect(importer.cancel()).toBe(true)
    next.resolve(encodeProject(composition()))
    expect(await second).toBeNull()
    expect(importer.cancel()).toBe(false)
  })
})
