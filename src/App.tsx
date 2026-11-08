import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import './App.css'
import { renderTextLayer } from './lib/renderTextLayer'
import { MAX_PROJECT_BYTES, parseProject, serializeProject } from './lib/project'
import type { EditorState, TextDirection, TextLayer } from './types/editor'

type Action =
  | { type: 'update_text_layer'; id: string; patch: Partial<TextLayer> }
  | { type: 'select_layer'; id: string }
  | { type: 'open_project'; state: EditorState }

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
    case 'open_project':
      return action.state
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
  const [fileStatus, setFileStatus] = useState('Save a project to keep editable text; export PNG for a finished image.')
  const [pendingProject, setPendingProject] = useState<EditorState | null>(null)
  const fileRequest = useRef(0)
  const projectFileRef = useRef<HTMLInputElement | null>(null)

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

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function saveProject() {
    try {
      download(new Blob([serializeProject(state)], { type: 'application/json' }), 'glyphforge-project.json')
      setFileStatus('Project JSON download requested. It contains editable text and settings, not font files.')
    } catch (error) {
      setFileStatus(error instanceof Error ? error.message : 'Project could not be saved.')
    }
  }

  function exportPng() {
    try {
      canvasRef.current?.toBlob(blob => {
        if (!blob) { setFileStatus('PNG export failed. Your composition is unchanged.'); return }
        download(blob, 'glyphforge.png')
        setFileStatus(`PNG download requested at ${state.document.width} × ${state.document.height} pixels, without the editor handle.`)
      }, 'image/png')
    } catch {
      setFileStatus('PNG export failed. Your composition is unchanged.')
    }
  }

  async function previewProject(event: React.ChangeEvent<HTMLInputElement>) {
    const request = ++fileRequest.current
    const file = event.currentTarget.files?.[0]
    setPendingProject(null)
    if (!file) return
    setFileStatus('Checking project. Your current composition is unchanged.')
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('Project files must be no larger than 1 MB.')
      const project = parseProject(await file.text())
      if (request !== fileRequest.current) return
      setPendingProject(project)
      setFileStatus(`Ready: ${project.layers[0].name}, ${project.document.width} × ${project.document.height}. Opening replaces the current composition. Save it first if needed.`)
    } catch (error) {
      if (request !== fileRequest.current) return
      setFileStatus(`${error instanceof Error ? error.message : 'Project could not be read.'} Current composition kept.`)
    }
  }

  function clearProjectPreview() {
    fileRequest.current++
    setPendingProject(null)
    if (projectFileRef.current) projectFileRef.current.value = ''
  }

  if (!selectedLayer) return null

  return (
    <div className="app-shell">
      <aside className="panel">
        <h2>GlyphForge • Phase 1</h2>
        <section className="project-tools" aria-label="Project files">
          <div className="file-actions">
            <button type="button" onClick={saveProject}>Save project JSON</button>
            <button type="button" onClick={exportPng}>Export PNG</button>
          </div>
          <label>
            Choose project JSON
            <input ref={projectFileRef} type="file" accept=".json,application/json" onChange={previewProject} aria-describedby="file-status" />
          </label>
          <div className="file-actions">
            <button type="button" disabled={!pendingProject} onClick={() => {
              if (!pendingProject) return
              setIsDraggingHandle(false)
              dispatch({ type: 'open_project', state: pendingProject })
              clearProjectPreview()
              setFileStatus('Project opened. No automatic browser save; download a project JSON to keep changes.')
            }}>Open project</button>
            <button type="button" disabled={!pendingProject} onClick={() => {
              clearProjectPreview()
              setFileStatus('Open cancelled. Current composition kept.')
            }}>Cancel open</button>
          </div>
          <p id="file-status" className="hint" role="status">{fileStatus}</p>
        </section>

        <label>
          Content
          <textarea
            value={selectedLayer.content}
            onChange={(e) => updateLayer({ content: e.target.value })}
            rows={5}
            maxLength={10000}
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
