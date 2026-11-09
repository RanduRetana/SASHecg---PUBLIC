import { normalizedToPixels, type NormalizedRect } from './geometry'

/** Flat charcoal. Fully opaque so nothing underneath can be sampled back. */
export const MASK_COLOR = { r: 17, g: 17, b: 17, a: 255 } as const

export const MASK_CSS = `rgb(${MASK_COLOR.r} ${MASK_COLOR.g} ${MASK_COLOR.b})`

/**
 * Overwrite RGBA pixels inside the rectangle. Alpha is forced to 255.
 * This is the reference implementation used to prove which pixels change.
 */
export function applyOpaqueRect(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  rect: NormalizedRect,
  color: { r: number; g: number; b: number; a: number } = MASK_COLOR,
): void {
  const area = normalizedToPixels(rect, imageWidth, imageHeight)
  const x0 = Math.max(0, area.x)
  const y0 = Math.max(0, area.y)
  const x1 = Math.min(imageWidth, area.x + area.width)
  const y1 = Math.min(imageHeight, area.y + area.height)
  for (let y = y0; y < y1; y++) {
    let index = (y * imageWidth + x0) * 4
    for (let x = x0; x < x1; x++) {
      pixels[index] = color.r
      pixels[index + 1] = color.g
      pixels[index + 2] = color.b
      pixels[index + 3] = 255
      index += 4
    }
  }
}

type PaintContext = {
  save(): void
  restore(): void
  fillRect(x: number, y: number, w: number, h: number): void
  fillStyle: string | CanvasGradient | CanvasPattern
  globalAlpha: number
  globalCompositeOperation: GlobalCompositeOperation
}

/**
 * Paint the mask directly onto a rendered page. `source-over` with alpha 1
 * replaces those pixels; the original PDF content stream is never copied.
 */
export function burnRedaction(
  ctx: PaintContext,
  width: number,
  height: number,
  rect: NormalizedRect,
  color: { r: number; g: number; b: number } = MASK_COLOR,
): void {
  const area = normalizedToPixels(rect, width, height)
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`
  ctx.fillRect(area.x, area.y, area.width, area.height)
  ctx.restore()
}

/** Paint every area. Later rectangles cover earlier ones where they overlap. */
export function burnRedactions(
  ctx: PaintContext,
  width: number,
  height: number,
  rects: readonly NormalizedRect[],
  color: { r: number; g: number; b: number } = MASK_COLOR,
): void {
  for (const rect of rects) burnRedaction(ctx, width, height, rect, color)
}
