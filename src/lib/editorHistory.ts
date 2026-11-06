import type { EditorState, TextLayer } from '../types/editor'
import type { Point } from './viewport'
import { constrainPosition } from './viewport'

export const HISTORY_LIMIT = 100

export interface EditorHistory {
  present: EditorState
  past: EditorState[]
  future: EditorState[]
  pending: { group: string; before: EditorState } | null
}

export type EditorAction =
  | { type: 'update_text_layer'; id: string; patch: Partial<TextLayer>; group?: string }
  | { type: 'move_text_layer'; id: string; delta: Point }
  | { type: 'select_layer'; id: string }
  | { type: 'replace_project'; state: EditorState }
  | { type: 'complete_edit'; group?: string }
  | { type: 'undo' | 'redo' }

function sameFields<T extends object>(left: T, right: T): boolean {
  const keys = Object.keys(left) as (keyof T)[]
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key])
}

/** Selection is view state; snapshots still restore the selection accompanying an edit. */
function sameComposition(left: EditorState, right: EditorState): boolean {
  return sameFields(left.document, right.document) && left.layers.length === right.layers.length &&
    left.layers.every((layer, index) => sameFields(layer, right.layers[index]))
}

export function createEditorHistory(present: EditorState): EditorHistory {
  return { present, past: [], future: [], pending: null }
}

function changedGroup(history: EditorHistory): boolean {
  return history.pending !== null && !sameComposition(history.pending.before, history.present)
}

export function canUndo(history: EditorHistory): boolean {
  return changedGroup(history) || history.past.length > 0
}

export function canRedo(history: EditorHistory): boolean {
  return !changedGroup(history) && history.future.length > 0
}

function remember(past: EditorState[], before: EditorState): EditorState[] {
  return [...past.slice(-(HISTORY_LIMIT - 1)), before]
}

function complete(history: EditorHistory): EditorHistory {
  if (!history.pending) return history
  return {
    ...history,
    past: changedGroup(history) ? remember(history.past, history.pending.before) : history.past,
    future: changedGroup(history) ? [] : history.future,
    pending: null,
  }
}

function edit(history: EditorHistory, present: EditorState, group?: string): EditorHistory {
  if (sameComposition(history.present, present)) return history
  if (group && history.pending?.group === group) return { ...history, present }
  const settled = complete(history)
  if (group) return { ...settled, present, pending: { group, before: settled.present } }
  return { present, past: remember(settled.past, settled.present), future: [], pending: null }
}

export function editorReducer(history: EditorHistory, action: EditorAction): EditorHistory {
  switch (action.type) {
    case 'update_text_layer': {
      const index = history.present.layers.findIndex((layer) => layer.id === action.id)
      if (index < 0) return history
      const layer = history.present.layers[index]
      const next = { ...layer, ...action.patch }
      if (sameFields(layer, next)) return history
      const layers = history.present.layers.slice()
      layers[index] = next
      return edit(history, { ...history.present, layers }, action.group)
    }
    case 'move_text_layer': {
      const layer = history.present.layers.find((candidate) => candidate.id === action.id)
      if (!layer) return history
      return editorReducer(history, {
        type: 'update_text_layer', id: layer.id,
        patch: constrainPosition({ x: layer.x + action.delta.x, y: layer.y + action.delta.y }, history.present.document),
      })
    }
    case 'replace_project':
      return edit(history, action.state)
    case 'select_layer':
      return history.present.selectedLayerId === action.id ? history : {
        ...history, present: { ...history.present, selectedLayerId: action.id },
      }
    case 'complete_edit':
      return action.group && history.pending?.group !== action.group ? history : complete(history)
    case 'undo': {
      const settled = complete(history)
      if (!settled.past.length) return settled
      return {
        present: settled.past[settled.past.length - 1], past: settled.past.slice(0, -1),
        future: [settled.present, ...settled.future], pending: null,
      }
    }
    case 'redo': {
      const settled = complete(history)
      if (!settled.future.length) return settled
      return {
        present: settled.future[0], past: remember(settled.past, settled.present),
        future: settled.future.slice(1), pending: null,
      }
    }
  }
}

/** Leave native field undo/redo (including non-text inputs) entirely to the browser. */
export function isNativeHistoryTarget(target: EventTarget | null): boolean {
  return target instanceof Element && (
    target.closest('input, textarea, select') !== null ||
    (target instanceof HTMLElement ? target.isContentEditable : target.closest<HTMLElement>('[contenteditable]')?.isContentEditable === true)
  )
}
