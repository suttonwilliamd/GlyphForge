import { describe, expect, it } from 'vitest'
import type { EditorState, TextLayer } from '../types/editor'
import { canRedo, canUndo, createEditorHistory, editorReducer, HISTORY_LIMIT } from './editorHistory'
import type { EditorHistory } from './editorHistory'
import { decodeProject, encodeProject } from './project'

function composition(): EditorState {
  return {
    document: { width: 1000, height: 700, background: '#ffffff' }, selectedLayerId: 'original',
    layers: [{
      id: 'original', name: 'Text', type: 'text', visible: true, locked: false, opacity: 100,
      x: 140, y: 130, rotation: 0, content: 'HELLO', fontFamily: 'Arial', fontSize: 56,
      fontWeight: 600, fontStyle: 'normal', color: '#111111', lineHeight: 1.1,
      letterSpacing: 2, direction: 'vertical_down', keepUpright: false,
    }],
  }
}

function patch(history: EditorHistory, value: Partial<TextLayer>, group?: string): EditorHistory {
  return editorReducer(history, { type: 'update_text_layer', id: history.present.layers[0].id, patch: value, group })
}

const undo = (history: EditorHistory) => editorReducer(history, { type: 'undo' })
const redo = (history: EditorHistory) => editorReducer(history, { type: 'redo' })
const complete = (history: EditorHistory, group?: string) => editorReducer(history, { type: 'complete_edit', group })

describe('completed composition history', () => {
  it('starts empty and safely ignores unavailable navigation', () => {
    const history = createEditorHistory(composition())
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
    expect(undo(history)).toBe(history)
    expect(redo(history)).toBe(history)
  })

  it('undoes and redoes discrete edits in order without mutating retained states', () => {
    const original = composition()
    const one = patch(createEditorHistory(original), { content: 'One' })
    const two = patch(one, { fontSize: 80 })
    expect(undo(two).present).toEqual(one.present)
    expect(undo(undo(two)).present).toEqual(original)
    expect(redo(redo(undo(undo(two)))).present).toEqual(two.present)
    expect(original).toEqual(composition())
  })

  it.each(['drag', 'content', 'fontFamily', 'fontSize', 'rotation', 'color'])('groups many %s updates into one completed edit', (group) => {
    const original = composition()
    let history = createEditorHistory(original)
    for (let x = 141; x <= 640; x++) history = patch(history, { x }, group)
    expect(history.past).toHaveLength(0)
    expect(canUndo(history)).toBe(true)
    history = complete(history, group)
    expect(history.past).toHaveLength(1)
    expect(undo(history).present).toEqual(original)
    expect(redo(undo(history)).present.layers[0].x).toBe(640)
  })

  it('settles an active edit before undo, retaining its last actual position for redo', () => {
    const original = composition()
    const dragging = patch(patch(createEditorHistory(original), { x: 200 }, 'drag'), { x: 270, y: 310 }, 'drag')
    const restored = undo(dragging)
    expect(restored.present).toEqual(original)
    expect(restored.pending).toBeNull()
    expect(complete(restored, 'drag')).toBe(restored)
    expect(redo(restored).present.layers[0]).toMatchObject({ x: 270, y: 310 })
  })

  it('separates changed groups and subsequent discrete edits without relying on render closures', () => {
    let history = createEditorHistory(composition())
    history = patch(history, { content: 'Typed' }, 'content')
    history = patch(history, { fontSize: 70 }, 'fontSize')
    history = patch(history, { keepUpright: true })
    expect(history.past).toHaveLength(3)
    expect(undo(history).present.layers[0]).toMatchObject({ content: 'Typed', fontSize: 70, keepUpright: false })
    expect(undo(undo(history)).present.layers[0]).toMatchObject({ content: 'Typed', fontSize: 56 })
    expect(undo(undo(undo(history))).present).toEqual(composition())
  })

  it('does not let an obsolete group completion split the current field edit', () => {
    const history = patch(createEditorHistory(composition()), { content: 'Typing' }, 'content')
    expect(complete(history, 'drag')).toBe(history)
    expect(complete(patch(history, { content: 'Typed' }, 'content')).past).toHaveLength(1)
  })

  it('preserves redo and capacity for equal patches, missing layers and equal imported objects', () => {
    const original = composition()
    let history = undo(patch(createEditorHistory(original), { content: 'Future' }))
    const unchanged = history
    history = patch(history, { x: original.layers[0].x })
    history = editorReducer(history, { type: 'update_text_layer', id: 'missing', patch: { content: 'No' } })
    history = editorReducer(history, { type: 'replace_project', state: decodeProject(encodeProject(original)) })
    expect(history).toBe(unchanged)
    expect(canRedo(history)).toBe(true)
    expect(redo(history).present.layers[0].content).toBe('Future')
  })

  it('preserves redo when a continuous edit returns to its starting value', () => {
    let history = undo(patch(createEditorHistory(composition()), { content: 'Future' }))
    history = patch(history, { x: 200 }, 'drag')
    expect(canRedo(history)).toBe(false)
    history = patch(history, { x: 140 }, 'drag')
    expect(canRedo(history)).toBe(true)
    history = complete(history, 'drag')
    expect(history.past).toHaveLength(0)
    expect(redo(history).present.layers[0].content).toBe('Future')
  })

  it('clears the redo branch only for a real completed replacement or edit', () => {
    let history = undo(patch(createEditorHistory(composition()), { content: 'Old branch' }))
    history = complete(patch(history, { rotation: 45 }, 'rotation'))
    expect(canRedo(history)).toBe(false)
    expect(redo(history)).toBe(history)
    expect(undo(history).present).toEqual(composition())
  })

  it('restores successful imports as one whole composition, including IDs and every persisted property', () => {
    const original = composition()
    const imported = composition()
    imported.document.background = '#ddeeff'
    imported.selectedLayerId = 'imported'
    Object.assign(imported.layers[0], {
      id: 'imported', name: 'Other', visible: false, opacity: 43, x: 950.25, y: 600.5,
      rotation: -87, content: 'Imported\n🌻', fontFamily: 'Georgia, serif', fontSize: 90,
      fontWeight: 300, fontStyle: 'italic', color: '#123456', lineHeight: 2,
      letterSpacing: -4, direction: 'vertical_up', keepUpright: true,
    })
    const history = editorReducer(createEditorHistory(original), { type: 'replace_project', state: decodeProject(encodeProject(imported)) })
    expect(history.past).toHaveLength(1)
    expect(undo(history).present).toEqual(original)
    expect(redo(undo(history)).present).toEqual(imported)
    expect(JSON.parse(encodeProject(history.present))).toEqual({ format: 'GlyphForge', version: 1, ...imported })
  })

  it('does not record selection-only changes or discard redo because of them', () => {
    const history = undo(patch(createEditorHistory(composition()), { rotation: 45 }))
    const selected = editorReducer(history, { type: 'select_layer', id: 'another-selection' })
    expect(selected.past).toHaveLength(0)
    expect(canRedo(selected)).toBe(true)
    expect(redo(selected).present.selectedLayerId).toBe('original')
  })

  it('retains exactly 100 completed steps, not samples, with correct oldest boundary and redo order', () => {
    let history = createEditorHistory(composition())
    for (let x = 1; x <= HISTORY_LIMIT + 5; x++) {
      for (let sample = 0; sample < 3; sample++) history = patch(history, { x: x + sample / 10 }, 'drag')
      history = complete(history, 'drag')
    }
    expect(history.past).toHaveLength(100)
    const latest = history.present
    for (let i = 0; i < 100; i++) history = undo(history)
    expect(history.present.layers[0].x).toBe(5.2)
    expect(canUndo(history)).toBe(false)
    expect(undo(history)).toBe(history)
    for (let i = 0; i < 100; i++) history = redo(history)
    expect(history.present).toEqual(latest)
    expect(canRedo(history)).toBe(false)
    expect(history.past).toHaveLength(100)
  })

  it('accumulates rapid keyboard moves from the reducer state and excludes clamped no-ops', () => {
    let history = createEditorHistory(composition())
    for (let i = 0; i < 30; i++) history = editorReducer(history, { type: 'move_text_layer', id: 'original', delta: { x: 10, y: 0 } })
    expect(history.present.layers[0].x).toBe(440)
    history = patch(history, { x: 1000 })
    const boundary = undo(patch(history, { y: 200 }))
    const noOp = editorReducer(boundary, { type: 'move_text_layer', id: 'original', delta: { x: 10, y: 0 } })
    expect(noOp).toBe(boundary)
    expect(canRedo(noOp)).toBe(true)
  })
})
