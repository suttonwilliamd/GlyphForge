import { describe, expect, it } from 'vitest'
import { MAX_PROJECT_BYTES, parseProject, serializeProject } from './project'
import type { EditorState } from '../types/editor'

const state: EditorState = {
  document: { width: 1000, height: 700, background: '#fef3c7' },
  layers: [{ id: 'poem', name: 'A composition', type: 'text', visible: true, locked: false, opacity: 70, x: 234, y: 123, rotation: -37, content: 'Night\n星', fontFamily: 'serif', fontSize: 72, fontWeight: 400, fontStyle: 'italic', color: '#123456', lineHeight: 1.4, letterSpacing: -2, direction: 'vertical_up', keepUpright: true }],
  selectedLayerId: 'poem',
}
const file = () => JSON.parse(serializeProject(state))
describe('portable project files', () => {
  it('round-trips a non-default composition without losing typography, transforms or Unicode', () => {
    expect(parseProject(serializeProject(state))).toEqual(state)
  })
  it('rejects incompatible files and versions instead of silently opening a blank project', () => {
    for (const value of [null, [], { ...file(), format: 'other' }, { ...file(), version: 2 }]) expect(() => parseProject(JSON.stringify(value))).toThrow()
    expect(() => parseProject('{')).toThrow(/valid GlyphForge JSON/)
    expect(() => parseProject(' '.repeat(MAX_PROJECT_BYTES + 1))).toThrow(/1 MB/)
  })
  it('rejects missing, multiple, unsupported or unselected layers rather than dropping artwork', () => {
    for (const patch of [{ layers: [] }, { layers: [...state.layers, ...state.layers] }, { selectedLayerId: 'missing' }, { layers: [{ ...state.layers[0], type: 'image' }] }]) expect(() => parseProject(JSON.stringify({ ...file(), ...patch }))).toThrow()
  })
  it('bounds canvas allocation, placement and rendering values before rendering imported data', () => {
    for (const doc of [{ width: 4097 }, { height: 0 }, { width: 1.5 }, { background: 'url(remote)' }]) expect(() => parseProject(JSON.stringify({ ...file(), document: { ...state.document, ...doc } }))).toThrow()
    for (const layer of [{ x: 1001 }, { y: -1 }, { opacity: 101 }, { fontSize: 0 }, { fontWeight: null }, { direction: 'diagonal' }, { color: 'red' }, { keepUpright: 'false' }, { content: 'x'.repeat(10001) }]) expect(() => parseProject(JSON.stringify({ ...file(), layers: [{ ...state.layers[0], ...layer }] }))).toThrow()
    expect(() => serializeProject({ ...state, layers: [{ ...state.layers[0], rotation: NaN }] })).toThrow()
  })
})
