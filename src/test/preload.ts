import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas'

const globals = globalThis as unknown as {
  Path2D?: unknown
  DOMMatrix?: unknown
  ImageData?: unknown
}

globals.Path2D ??= Path2D
globals.DOMMatrix ??= DOMMatrix
globals.ImageData ??= ImageData
