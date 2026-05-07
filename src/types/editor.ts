export type TextDirection = 'horizontal' | 'vertical_down' | 'vertical_up'

export interface DocumentSchema {
  width: number
  height: number
  background: string
}

export interface BaseLayer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  x: number
  y: number
  rotation: number
}

export interface TextLayer extends BaseLayer {
  type: 'text'
  content: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  color: string
  lineHeight: number
  letterSpacing: number
  direction: TextDirection
  keepUpright: boolean
}

export type Layer = TextLayer

export interface EditorState {
  document: DocumentSchema
  layers: Layer[]
  selectedLayerId: string | null
}
