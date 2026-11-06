import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import './App.css'
import { renderTextLayer } from './lib/renderTextLayer'
import type { EditorState, TextDirection, TextLayer } from './types/editor'
import { clamp, constrainPosition, getViewport, MAX_ZOOM, MIN_ZOOM, toDocument, toViewport } from './lib/viewport'
import type { Point } from './lib/viewport'

type Gesture =
  | { kind: 'handle'; pointerId: number; offset: Point }
  | { kind: 'pan'; pointerId: number; start: Point; pan: Point }

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
  keepUpright: false,
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
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const [activeGesture, setActiveGesture] = useState<Gesture['kind'] | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [panMode, setPanMode] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(() => !window.matchMedia('(max-width: 900px)').matches)
  const view = getViewport(state.document, viewportSize, zoom, pan)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

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

  const localPoint = (event: React.PointerEvent): Point => {
    const rect = viewportRef.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const finishGesture = (event: React.PointerEvent) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return
    gestureRef.current = null
    setActiveGesture(null)
  }

  const moveGesture = (event: React.PointerEvent) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const point = localPoint(event)
    if (gesture.kind === 'handle') {
      const logical = toDocument(point, view)
      updateLayer(constrainPosition({ x: logical.x - gesture.offset.x, y: logical.y - gesture.offset.y }, state.document))
    } else {
      setPan(getViewport(state.document, viewportSize, zoom, {
        x: gesture.pan.x + point.x - gesture.start.x,
        y: gesture.pan.y + point.y - gesture.start.y,
      }).pan)
    }
  }

  const changeZoom = (delta: number) => {
    setZoom((current) => clamp(current + delta, MIN_ZOOM, MAX_ZOOM))
    setPan(view.pan)
  }

  const fitToView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  if (!selectedLayer) return null

  return (
    <div className="app-shell">
      <main className="canvas-wrap">
        <header className="stage-header">
          <h1>GlyphForge</h1>
          <span>1000 × 700 document</span>
        </header>
        <div className="viewport-toolbar" role="group" aria-label="Canvas view">
          <button type="button" onClick={() => changeZoom(-0.25)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
          <output aria-label="Zoom level">{Math.round(view.scale * 100)}%</output>
          <button type="button" onClick={() => changeZoom(0.25)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
          <button type="button" onClick={fitToView}>Fit to view</button>
          <button type="button" aria-pressed={panMode} onClick={() => setPanMode((current) => !current)}>Pan view</button>
        </div>
        <p className="hint" id="viewport-help">
          {panMode ? 'Drag the view or use arrow keys to pan. Turn Pan view off to scroll the page.' : 'Drag the blue handle to move text. Use Pan view to navigate when zoomed.'}
        </p>
        <div
          className={`canvas-viewport ${panMode ? 'pan-mode' : ''} ${activeGesture === 'pan' ? 'panning' : ''}`}
          ref={viewportRef}
          role="region"
          aria-label="Document viewport"
          aria-describedby="viewport-help"
          tabIndex={0}
          onPointerDown={(event) => {
            if (!panMode || event.button !== 0 || gestureRef.current) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            gestureRef.current = { kind: 'pan', pointerId: event.pointerId, start: localPoint(event), pan: view.pan }
            setActiveGesture('pan')
          }}
          onPointerMove={moveGesture}
          onPointerUp={finishGesture}
          onPointerCancel={finishGesture}
          onLostPointerCapture={finishGesture}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || !panMode) return
            const deltas: Record<string, Point> = { ArrowLeft: { x: 40, y: 0 }, ArrowRight: { x: -40, y: 0 }, ArrowUp: { x: 0, y: 40 }, ArrowDown: { x: 0, y: -40 } }
            const delta = deltas[event.key]
            if (!delta) return
            event.preventDefault()
            setPan(getViewport(state.document, viewportSize, zoom, { x: view.pan.x + delta.x, y: view.pan.y + delta.y }).pan)
          }}
        >
          <canvas
            ref={canvasRef}
            width={state.document.width}
            height={state.document.height}
            className="editor-canvas"
            aria-label="Text composition preview"
            style={{ transform: `translate(${view.origin.x}px, ${view.origin.y}px) scale(${view.scale})` }}
          />
          <button
            type="button"
            className={`text-handle ${activeGesture === 'handle' ? 'dragging' : ''}`}
            style={{ left: toViewport(selectedLayer, view).x, top: toViewport(selectedLayer, view).y }}
            aria-label="Move text"
            aria-describedby="handle-help text-position"
            onPointerDown={(event) => {
              if (event.button !== 0 || gestureRef.current) return
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.focus({ preventScroll: true })
              event.currentTarget.setPointerCapture(event.pointerId)
              const point = toDocument(localPoint(event), view)
              gestureRef.current = { kind: 'handle', pointerId: event.pointerId, offset: { x: point.x - selectedLayer.x, y: point.y - selectedLayer.y } }
              setActiveGesture('handle')
            }}
            onKeyDown={(event) => {
              const deltas: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }
              const delta = deltas[event.key]
              if (!delta) return
              event.preventDefault()
              const step = event.shiftKey ? 10 : 1
              updateLayer(constrainPosition({ x: selectedLayer.x + delta.x * step, y: selectedLayer.y + delta.y * step }, state.document))
            }}
          />
        </div>
        <p className="hint" id="handle-help">Move text with arrow keys; hold Shift for 10 document pixels.</p>
        <output className="position-readout" id="text-position">Position: X {selectedLayer.x}, Y {selectedLayer.y}</output>
      </main>
      <aside className="panel" aria-label="Text controls">
        <details open={controlsOpen} onToggle={(event) => setControlsOpen(event.currentTarget.open)}>
          <summary>Text controls</summary>
          <div className="panel-fields">

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

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={selectedLayer.keepUpright}
            onChange={(e) => updateLayer({ keepUpright: e.target.checked })}
          />
          Keep characters upright
        </label>

        <p className="hint">Position is in document pixels; zoom and pan never change the text layout.</p>

        <label>
          Color
          <input
            type="color"
            value={selectedLayer.color}
            onChange={(e) => updateLayer({ color: e.target.value })}
          />
        </label>
          </div>
        </details>
      </aside>
    </div>
  )
}

export default App
