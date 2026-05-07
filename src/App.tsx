import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
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
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [isDraggingHandle, setIsDraggingHandle] = useState(false)

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

  const updateLayer = useCallback(
    (patch: Partial<TextLayer>) => {
      if (!selectedLayer) return
      dispatch({ type: 'update_text_layer', id: selectedLayer.id, patch })
    },
    [selectedLayer],
  )

  const clamp = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value))
  }

  const getCanvasPointFromPointer = useCallback(
    (event: PointerEvent | React.PointerEvent) => {
      const stage = stageRef.current
      if (!stage) return null

      const rect = stage.getBoundingClientRect()
      const scaleX = state.document.width / rect.width
      const scaleY = state.document.height / rect.height

      return {
        x: clamp(Math.round((event.clientX - rect.left) * scaleX), 0, state.document.width),
        y: clamp(Math.round((event.clientY - rect.top) * scaleY), 0, state.document.height),
      }
    },
    [state.document.height, state.document.width],
  )

  const onHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDraggingHandle(true)
  }

  useEffect(() => {
    if (!isDraggingHandle || !selectedLayer) return

    const onPointerMove = (event: PointerEvent) => {
      const point = getCanvasPointFromPointer(event)
      if (!point) return
      updateLayer({ x: point.x, y: point.y })
    }

    const onPointerUp = () => {
      setIsDraggingHandle(false)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [getCanvasPointFromPointer, isDraggingHandle, selectedLayer, updateLayer])

  if (!selectedLayer) return null

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

        <p className="hint">Tip: drag the handle on the canvas to move text position.</p>

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
        <div className="canvas-stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            width={state.document.width}
            height={state.document.height}
            className="editor-canvas"
          />
          <div
            className={`text-handle ${isDraggingHandle ? 'dragging' : ''}`}
            style={{ left: `${selectedLayer.x}px`, top: `${selectedLayer.y}px` }}
            onPointerDown={onHandlePointerDown}
            title="Drag to move text"
          />
        </div>
      </main>
    </div>
  )
}

export default App
