import type { EditorState, TextLayer } from '../types/editor'

export const MAX_PROJECT_BYTES = 1_000_000
function fail(field: string): never { throw new Error(`Invalid project ${field}.`) }
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field)
  return value as Record<string, unknown>
}
function text(value: unknown, field: string, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(field)
  return value as string
}
function number(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(field)
  return value as number
}
function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') fail(field)
  return value as boolean
}
function color(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail(field)
  return value as string
}
function projectState(input: unknown): EditorState {
  const value = record(input, 'state')
  const doc = record(value.document, 'document')
  const width = number(doc.width, 'width', 1, 4096), height = number(doc.height, 'height', 1, 4096)
  if (!Number.isInteger(width) || !Number.isInteger(height)) fail('dimensions')
  if (!Array.isArray(value.layers) || value.layers.length !== 1) throw new Error('This editor supports exactly one text layer.')
  const layer = record(value.layers[0], 'layer')
  if (layer.type !== 'text') fail('layer type')
  if (!['horizontal', 'vertical_down', 'vertical_up'].includes(String(layer.direction))) fail('direction')
  if (layer.fontStyle !== 'normal' && layer.fontStyle !== 'italic') fail('font style')
  const id = text(layer.id, 'layer ID', 100)
  if (value.selectedLayerId !== id) fail('selected layer')
  const result: TextLayer = {
    id, name: text(layer.name, 'layer name', 200), type: 'text',
    visible: boolean(layer.visible, 'visibility'), locked: boolean(layer.locked, 'lock'),
    opacity: number(layer.opacity, 'opacity', 0, 100),
    x: number(layer.x, 'X coordinate', 0, width), y: number(layer.y, 'Y coordinate', 0, height),
    rotation: number(layer.rotation, 'rotation', -180, 180),
    content: text(layer.content, 'content', 10000, true),
    fontFamily: text(layer.fontFamily, 'font family', 200),
    fontSize: number(layer.fontSize, 'font size', 8, 180),
    fontWeight: number(layer.fontWeight, 'font weight', 100, 900),
    fontStyle: layer.fontStyle, color: color(layer.color, 'text color'),
    lineHeight: number(layer.lineHeight, 'line height', 0.1, 10),
    letterSpacing: number(layer.letterSpacing, 'letter spacing', -10, 60),
    direction: layer.direction as TextLayer['direction'],
    keepUpright: boolean(layer.keepUpright, 'upright setting'),
  }
  return { document: { width, height, background: color(doc.background, 'background') }, layers: [result], selectedLayerId: id }
}
export function parseProject(source: string): EditorState {
  if (source.length > MAX_PROJECT_BYTES) throw new Error('Project files must be no larger than 1 MB.')
  let value: unknown
  try { value = JSON.parse(source) } catch { throw new Error('Choose a valid GlyphForge JSON project.') }
  const project = record(value, 'file')
  if (project.format !== 'glyphforge' || project.version !== 1) throw new Error('Unsupported GlyphForge project format or version.')
  return projectState(project)
}
export function serializeProject(state: EditorState): string {
  return JSON.stringify({ format: 'glyphforge', version: 1, ...projectState(state) }, null, 2)
}
