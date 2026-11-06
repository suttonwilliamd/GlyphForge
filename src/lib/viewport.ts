export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Viewport { scale: number; pan: Point; origin: Point }

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4
const GUTTER = 24

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

// View state is separate from document coordinates. The gutter keeps a 44px
// handle reachable even at document edges, without scaling its hit target.
export function getViewport(document: Size, viewport: Size, zoom: number, pan: Point): Viewport {
  const fit = Math.min(
    Math.max(1, viewport.width - GUTTER * 2) / document.width,
    Math.max(1, viewport.height - GUTTER * 2) / document.height,
    1,
  )
  const scale = fit * clamp(zoom, MIN_ZOOM, MAX_ZOOM)
  const maxX = Math.max(0, (document.width * scale - viewport.width) / 2 + GUTTER)
  const maxY = Math.max(0, (document.height * scale - viewport.height) / 2 + GUTTER)
  const boundedPan = { x: clamp(pan.x, -maxX, maxX), y: clamp(pan.y, -maxY, maxY) }
  return {
    scale,
    pan: boundedPan,
    origin: {
      x: (viewport.width - document.width * scale) / 2 + boundedPan.x,
      y: (viewport.height - document.height * scale) / 2 + boundedPan.y,
    },
  }
}


export function toDocument(point: Point, view: Viewport): Point {
  return { x: (point.x - view.origin.x) / view.scale, y: (point.y - view.origin.y) / view.scale }
}

export function toViewport(point: Point, view: Viewport): Point {
  return { x: view.origin.x + point.x * view.scale, y: view.origin.y + point.y * view.scale }
}

export function constrainPosition(point: Point, document: Size): Point {
  return { x: clamp(Math.round(point.x), 0, document.width), y: clamp(Math.round(point.y), 0, document.height) }
}
