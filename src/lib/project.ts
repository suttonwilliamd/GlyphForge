import type { EditorState } from '../types/editor'

export const MAX_CONTENT_LENGTH = 10_000
export const MAX_FONT_FAMILY_LENGTH = 200
export const MAX_PROJECT_BYTES = 256_000

function invalid(reason: string): never {
  throw new Error(`Invalid GlyphForge project: ${reason}`)
}

function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object.`)
  const result = value as Record<string, unknown>
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(result, key))) {
    invalid(`${label} has missing or unsupported fields.`)
  }
  return result
}

function text(value: unknown, max: number, label: string, empty = false): void {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) {
    invalid(`${label} must be ${empty ? `at most ${max}` : `1–${max}`} characters.`)
  }
}

function number(value: unknown, min: number, max: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    invalid(`${label} must be a finite number from ${min} to ${max}.`)
  }
}

function choice(value: unknown, options: unknown[], label: string): void {
  if (!options.includes(value)) invalid(`${label} is unsupported.`)
}

function color(value: unknown, label: string): void {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) invalid(`${label} must be a six-digit hex color.`)
}

function validate(value: unknown): EditorState {
  const root = object(value, ['format', 'version', 'document', 'layers', 'selectedLayerId'], 'Project')
  choice(root.format, ['GlyphForge'], 'Format')
  choice(root.version, [1], 'Version')
  const document = object(root.document, ['width', 'height', 'background'], 'Document')
  // The current editor's position bounds and labels assume this logical size.
  choice(document.width, [1000], 'Document width (only 1000 is supported)')
  choice(document.height, [700], 'Document height (only 700 is supported)')
  color(document.background, 'Background')
  if (!Array.isArray(root.layers) || root.layers.length !== 1) invalid('Exactly one editable text layer is required.')
  const layer = object(root.layers[0], [
    'id', 'name', 'type', 'visible', 'locked', 'opacity', 'x', 'y', 'rotation', 'content',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color', 'lineHeight', 'letterSpacing', 'direction', 'keepUpright',
  ], 'Text layer')
  choice(layer.type, ['text'], 'Layer type')
  text(layer.id, 100, 'Layer ID')
  text(layer.name, 100, 'Layer name')
  choice(layer.visible, [true, false], 'Visibility')
  choice(layer.locked, [false], 'Locked layers (not editable in this editor)')
  number(layer.opacity, 0, 100, 'Opacity')
  number(layer.x, 0, 1000, 'X position')
  number(layer.y, 0, 700, 'Y position')
  number(layer.rotation, -180, 180, 'Rotation')
  text(layer.content, MAX_CONTENT_LENGTH, 'Content', true)
  text(layer.fontFamily, MAX_FONT_FAMILY_LENGTH, 'Font family', true)
  number(layer.fontSize, 8, 180, 'Font size')
  number(layer.fontWeight, 1, 1000, 'Font weight')
  choice(layer.fontStyle, ['normal', 'italic'], 'Font style')
  color(layer.color, 'Text color')
  number(layer.lineHeight, 0.1, 10, 'Line height')
  number(layer.letterSpacing, -10, 60, 'Letter spacing')
  choice(layer.direction, ['horizontal', 'vertical_down', 'vertical_up'], 'Direction')
  choice(layer.keepUpright, [true, false], 'Keep upright')
  if (root.selectedLayerId !== layer.id) invalid('The single text layer must be selected.')
  return { document: root.document, layers: root.layers, selectedLayerId: root.selectedLayerId } as EditorState
}

export function decodeProject(source: string): EditorState {
  if (new TextEncoder().encode(source).byteLength > MAX_PROJECT_BYTES) invalid(`File exceeds ${MAX_PROJECT_BYTES} bytes.`)
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    invalid('File is not valid JSON.')
  }
  return validate(value)
}

export function encodeProject(state: EditorState): string {
  const project = { format: 'GlyphForge', version: 1, ...state }
  validate(project)
  const source = JSON.stringify(project, null, 2)
  if (new TextEncoder().encode(source).byteLength > MAX_PROJECT_BYTES) invalid(`File exceeds ${MAX_PROJECT_BYTES} bytes.`)
  return source
}

/** Latest selection wins; edits/unmount can invalidate a pending File.text(). */
export function createProjectImporter() {
  let generation = 0
  let pending = false
  return {
    cancel() {
      generation++
      const wasPending = pending
      pending = false
      return wasPending
    },
    async load(file: Pick<File, 'size' | 'text'>): Promise<EditorState | null> {
      const request = ++generation
      pending = true
      try {
        if (file.size > MAX_PROJECT_BYTES) invalid(`File exceeds ${MAX_PROJECT_BYTES} bytes.`)
        const source = await file.text()
        if (request !== generation) return null
        return decodeProject(source)
      } catch (error) {
        if (request !== generation) return null
        throw error
      } finally {
        if (request === generation) pending = false
      }
    },
  }
}
