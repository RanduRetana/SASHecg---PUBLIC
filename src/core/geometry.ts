/** A rectangle in page space. Origin is the top-left of the visual page. Values are fractions of the page. */
export type NormalizedRect = {
  /** Stable identity. Study codes follow this id when areas are removed or reordered. */
  id?: string
  x: number
  y: number
  width: number
  height: number
}

export type PixelRect = {
  x: number
  y: number
  width: number
  height: number
}

export type ClientBounds = {
  left: number
  top: number
  width: number
  height: number
}

export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/**
 * Upper-left block on a typical one-page ECG report: identifiers sit in the
 * header, clear of the trace and of the measurements on the right.
 */
export const DEFAULT_REDACTION: NormalizedRect = {
  id: 'area-1',
  x: 0,
  y: 0,
  width: 0.3,
  height: 0.155,
}

/** Next `area-N` id that is not already used. */
export function nextAreaId(existing: readonly NormalizedRect[]): string {
  const used = new Set(existing.map((rect) => rect.id).filter((id): id is string => Boolean(id)))
  let n = 1
  while (used.has(`area-${n}`)) n += 1
  return `area-${n}`
}

export const MIN_RECT_EDGE = 0.02

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function clampRect(rect: NormalizedRect): NormalizedRect {
  let width = Number.isFinite(rect.width) ? rect.width : MIN_RECT_EDGE
  let height = Number.isFinite(rect.height) ? rect.height : MIN_RECT_EDGE
  width = Math.min(Math.max(width, MIN_RECT_EDGE), 1)
  height = Math.min(Math.max(height, MIN_RECT_EDGE), 1)

  let x = Number.isFinite(rect.x) ? rect.x : 0
  let y = Number.isFinite(rect.y) ? rect.y : 0
  if (x < 0) x = 0
  if (y < 0) y = 0
  if (x + width > 1) x = 1 - width
  if (y + height > 1) y = 1 - height
  if (x < 0) {
    x = 0
    width = 1
  }
  if (y < 0) {
    y = 0
    height = 1
  }
  const next = { x, y, width, height }
  return rect.id ? { ...next, id: rect.id } : next
}

export function roundRect(rect: NormalizedRect, places = 4): NormalizedRect {
  const factor = 10 ** places
  const round = (value: number) => Math.round(value * factor) / factor
  const next = clampRect({
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
  })
  return rect.id ? { ...next, id: rect.id } : next
}

export function rectsEqual(a: NormalizedRect, b: NormalizedRect, epsilon = 0.0001): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  )
}

/**
 * Map a normalized rectangle onto a bitmap. Rounding uses the outer edges so
 * the mask never leaves a fractional pixel of the source showing inside.
 */
export function normalizedToPixels(rect: NormalizedRect, pixelWidth: number, pixelHeight: number): PixelRect {
  const safe = clampRect(rect)
  const width = Math.max(0, pixelWidth)
  const height = Math.max(0, pixelHeight)
  const x = clampPixel(Math.round(safe.x * width), width)
  const y = clampPixel(Math.round(safe.y * height), height)
  const right = clampPixel(Math.round((safe.x + safe.width) * width), width)
  const bottom = clampPixel(Math.round((safe.y + safe.height) * height), height)
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  }
}

/**
 * Convert a pointer position to page fractions. `bounds` must be the CSS box
 * of the rendered page (getBoundingClientRect), not the canvas bitmap size.
 * A 1200×900 bitmap shown at 400×300 CSS pixels still maps a pointer in the
 * middle of that box to (0.5, 0.5).
 */
export function pointerToNormalized(clientX: number, clientY: number, bounds: ClientBounds): { x: number; y: number } {
  const width = bounds.width > 0 ? bounds.width : 1
  const height = bounds.height > 0 ? bounds.height : 1
  return {
    x: clamp01((clientX - bounds.left) / width),
    y: clamp01((clientY - bounds.top) / height),
  }
}

export function applyHandle(rect: NormalizedRect, handle: Handle, dx: number, dy: number): NormalizedRect {
  if (handle === 'move') {
    return clampRect({
      x: rect.x + dx,
      y: rect.y + dy,
      width: rect.width,
      height: rect.height,
    })
  }

  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.width
  let bottom = rect.y + rect.height

  if (handle.includes('w')) left += dx
  if (handle.includes('e')) right += dx
  if (handle.includes('n')) top += dy
  if (handle.includes('s')) bottom += dy

  if (right < left) {
    const swap = left
    left = right
    right = swap
  }
  if (bottom < top) {
    const swap = top
    top = bottom
    bottom = swap
  }

  return clampRect({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  })
}

export function rectsOverlap(a: NormalizedRect, b: NormalizedRect, epsilon = 0.004): boolean {
  return (
    a.x < b.x + b.width - epsilon &&
    a.x + a.width > b.x + epsilon &&
    a.y < b.y + b.height - epsilon &&
    a.y + a.height > b.y + epsilon
  )
}

const NEW_RECT_WIDTH = 0.22
const NEW_RECT_HEIGHT = 0.12

/**
 * A new area that sits clear of the ones already on the page, still inside
 * the edges. Later areas step down the page if the first gaps are taken.
 */
export function placeNewRect(existing: readonly NormalizedRect[]): NormalizedRect {
  const placed = existing.map(clampRect)
  const candidates: NormalizedRect[] = []
  const seeds: Array<[number, number]> = [
    [0.34, 0],
    [0, 0.2],
    [0.56, 0],
    [0.34, 0.2],
    [0.56, 0.2],
    [0.78, 0],
    [0, 0.4],
    [0.28, 0.4],
    [0.56, 0.4],
    [0, 0.62],
    [0.34, 0.62],
    [0.62, 0.62],
  ]
  for (const [x, y] of seeds) {
    candidates.push(clampRect({ x, y, width: NEW_RECT_WIDTH, height: NEW_RECT_HEIGHT }))
  }
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 4; column++) {
      candidates.push(clampRect({ x: column * 0.25, y: row * 0.14, width: NEW_RECT_WIDTH, height: NEW_RECT_HEIGHT }))
    }
  }
  for (const candidate of candidates) {
    if (!placed.some((other) => rectsOverlap(candidate, other))) return candidate
  }
  const last = placed[placed.length - 1] ?? DEFAULT_REDACTION
  return clampRect({ x: last.x + 0.05, y: last.y + 0.05, width: NEW_RECT_WIDTH, height: NEW_RECT_HEIGHT })
}

export function sameRectList(a: readonly NormalizedRect[], b: readonly NormalizedRect[], epsilon = 0.0001): boolean {
  if (a.length !== b.length) return false
  return a.every((rect, index) => {
    const other = b[index]
    return other !== undefined && rectsEqual(rect, other, epsilon)
  })
}

/** Shared areas for every page, unless that page stores its own full set. */
export function rectsForPage(
  index: number,
  fallback: readonly NormalizedRect[],
  overrides?: Readonly<Record<number, readonly NormalizedRect[] | undefined>>,
): { rects: NormalizedRect[]; exception: boolean } {
  const custom = overrides?.[index]
  if (custom && custom.length > 0) return { rects: custom.map(clampRect), exception: true }
  const shared = fallback.length > 0 ? fallback.map(clampRect) : [clampRect(DEFAULT_REDACTION)]
  return { rects: shared, exception: false }
}

export function replaceRectAt(rects: readonly NormalizedRect[], index: number, next: NormalizedRect): NormalizedRect[] {
  if (rects.length === 0) return [roundRect(next.id ? next : { ...next, id: nextAreaId(rects) })]
  const safeIndex = Math.min(Math.max(0, index), rects.length - 1)
  return rects.map((rect, cursor) => {
    if (cursor !== safeIndex) return clampRect(rect)
    const id = next.id ?? rect.id
    return roundRect(id ? { ...next, id } : next)
  })
}

export function withNewRect(rects: readonly NormalizedRect[]): { rects: NormalizedRect[]; selected: number } {
  const current = rects.length > 0 ? rects.map(clampRect) : [clampRect(DEFAULT_REDACTION)]
  const placed = placeNewRect(current)
  return { rects: [...current, { ...placed, id: nextAreaId(current) }], selected: current.length }
}

/** Returns null when the set would become empty. A page always keeps one area. */
export function withoutRect(
  rects: readonly NormalizedRect[],
  index: number,
): { rects: NormalizedRect[]; selected: number } | null {
  if (rects.length <= 1) return null
  const safeIndex = Math.min(Math.max(0, index), rects.length - 1)
  const next = rects.filter((_, cursor) => cursor !== safeIndex).map(clampRect)
  return { rects: next, selected: Math.min(safeIndex, next.length - 1) }
}

function clampPixel(value: number, limit: number): number {
  if (value < 0) return 0
  if (value > limit) return limit
  return value
}
