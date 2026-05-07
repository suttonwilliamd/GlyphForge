import { useEffect, useMemo, useReducer, useRef } from 'react'
import './App.css'
import { renderTextLayer } from './lib/renderTextLayer'
import type { EditorState, TextDirection, TextLayer } from './types/editor'

type Action =
  | { type: 'update_text_layer'; id: string; patch: Partial<TextLayer> }
  | { type: 'select_layer'; id: string }

const initialLayer: TextLayer = {
  id: 'layer-1',
  name: 'Text 1',
  type: 'text',
  visible: true,
  locked: false,
  opacity: 100,
  x: 140,
  y: 130,
  rotation: 0,
  content: 'HELLO',
  fontFamily: 'Arial',
  fontSize: 56,
  fontWeight: 600,
  fontStyle: 'normal',
  color: '#111111',
  lineHeight: 1.1,
  letterSpacing: 2,
  direction: 'vertical_down',
}

const initialState: EditorState = {
  document: {
    width: 1000,
    height: 700,
    background: '#ffffff',
  },
  layers: [initialLayer],
  selectedLayerId: initialLayer.id,
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'update_text_layer':
      return {
        ...state,
        layers: state.layers.map((layer) => {
          if (layer.id !== action.id || layer.type !== 'text') return layer
          return { ...layer, ...action.patch }
        }),
      }
    case 'select_layer':
      return { ...state, selectedLayerId: action.id }
    default:
      return state
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const selectedLayer = useMemo(() => {
    return state.layers.find((layer) => layer.id === state.selectedLayerId && layer.type === 'text') as
      | TextLayer
      | undefined
  }, [state.layers, state.selectedLayerId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, state.document.width, state.document.height)
    ctx.fillStyle = state.document.background
    ctx.fillRect(0, 0, state.document.width, state.document.height)

    state.layers.forEach((layer) => {
      if (layer.type === 'text') renderTextLayer(ctx, layer)
    })
  }, [state])

  if (!selectedLayer) return null

  const updateLayer = (patch: Partial<TextLayer>) => {
    dispatch({ type: 'update_text_layer', id: selectedLayer.id, patch })
  }

  return (
    <div className="app-shell">
      <aside className="panel">
        <h2>GlyphForge • Phase 1</h2>

        <label>
          Content
          <textarea
            value={selectedLayer.content}
            onChange={(e) => updateLayer({ content: e.target.value })}
            rows={5}
          />
        </label>

        <label>
          Font Family
          <input
            type="text"
            value={selectedLayer.fontFamily}
            onChange={(e) => updateLayer({ fontFamily: e.target.value })}
          />
        </label>

        <label>
          Font Size: {selectedLayer.fontSize}px
          <input
            type="range"
            min={8}
            max={180}
            value={selectedLayer.fontSize}
            onChange={(e) => updateLayer({ fontSize: Number(e.target.value) })}
          />
        </label>

        <label>
          Letter Spacing: {selectedLayer.letterSpacing}px
          <input
            type="range"
            min={-10}
            max={60}
            value={selectedLayer.letterSpacing}
            onChange={(e) => updateLayer({ letterSpacing: Number(e.target.value) })}
          />
        </label>

        <label>
          Direction
          <select
            value={selectedLayer.direction}
            onChange={(e) => updateLayer({ direction: e.target.value as TextDirection })}
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical_down">Vertical Down</option>
            <option value="vertical_up">Vertical Up</option>
          </select>
        </label>

        <label>
          Rotation: {selectedLayer.rotation}°
          <input
            type="range"
            min={-180}
            max={180}
            value={selectedLayer.rotation}
            onChange={(e) => updateLayer({ rotation: Number(e.target.value) })}
          />
        </label>

        <label>
          Position X: {selectedLayer.x}
          <input
            type="range"
            min={0}
            max={state.document.width}
            value={selectedLayer.x}
            onChange={(e) => updateLayer({ x: Number(e.target.value) })}
          />
        </label>

        <label>
          Position Y: {selectedLayer.y}
          <input
            type="range"
            min={0}
            max={state.document.height}
            value={selectedLayer.y}
            onChange={(e) => updateLayer({ y: Number(e.target.value) })}
          />
        </label>

        <label>
          Color
          <input
            type="color"
            value={selectedLayer.color}
            onChange={(e) => updateLayer({ color: e.target.value })}
          />
        </label>
      </aside>

      <main className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={state.document.width}
          height={state.document.height}
          className="editor-canvas"
        />
      </main>
    </div>
  )
}

export default App
