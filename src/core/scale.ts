/** Clinical target. Letter/A4 pages land near 4–6 megapixels, which stays sharp without exhausting a laptop. */
export const TARGET_DPI = 220

/** Hard cap on the raster of a single page. Larger pages drop DPI instead of allocating a huge bitmap. */
export const MAX_PIXELS = 8_000_000

export type ScaleChoice = {
  scale: number
  dpi: number
  /** True when a 200 DPI target could not be kept. */
  capped: boolean
}

export function chooseRenderScale(
  widthPt: number,
  heightPt: number,
  options?: { targetDpi?: number; maxPixels?: number; memoryPressure?: boolean },
): ScaleChoice {
  const requested = options?.targetDpi ?? TARGET_DPI
  const wanted = options?.memoryPressure ? Math.min(requested, 160) : requested
  const maxPixels = options?.maxPixels ?? MAX_PIXELS
  const width = Math.max(widthPt, 1)
  const height = Math.max(heightPt, 1)

  let dpi = Math.max(wanted, 36)
  let scale = dpi / 72
  if (width * scale * height * scale > maxPixels) {
    scale = Math.sqrt(maxPixels / (width * height))
    dpi = scale * 72
  }
  if (scale < 0.5) {
    scale = 0.5
    dpi = scale * 72
  }

  const capped = wanted >= 200 && dpi < 199.5
  return { scale, dpi, capped }
}

export function browserMemoryPressure(): boolean {
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }
    }
  ).memory
  if (!memory || !memory.jsHeapSizeLimit) return false
  return memory.usedJSHeapSize / memory.jsHeapSizeLimit > 0.72
}
