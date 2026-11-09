import type { CanvasFactory } from './flatten'

export const createBrowserCanvas: CanvasFactory = (width, height) => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width))
  canvas.height = Math.max(1, Math.ceil(height))
  return canvas
}
