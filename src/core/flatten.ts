import { PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { NormalizedRect } from './geometry'
import { burnRedactions } from './redact'
import { chooseRenderScale } from './scale'
import { burnStudyLabel, type StudyRotation } from './studyCode'

export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement

export class ProcessCancelled extends Error {
  constructor() {
    super('Processing cancelled')
    this.name = 'ProcessCancelled'
  }
}

export type FlatPage = {
  pdfBytes: Uint8Array
  previewBytes: Uint8Array | null
  widthPt: number
  heightPt: number
  dpi: number
  capped: boolean
}

export async function imageToSinglePagePdf(png: Uint8Array, widthPt: number, heightPt: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Redactly')
  doc.setAuthor('')
  doc.setSubject('Page anonymized locally')
  doc.setKeywords([])
  doc.setProducer('Redactly')
  doc.setCreator('Redactly')
  const image = await doc.embedPng(png)
  const page = doc.addPage([widthPt, heightPt])
  page.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt })
  return new Uint8Array(await doc.save())
}

export async function flattenPage(options: {
  pdf: PDFDocumentProxy
  pageIndex: number
  rects: readonly NormalizedRect[]
  canvasFactory: CanvasFactory
  targetDpi?: number
  maxPixels?: number
  memoryPressure?: boolean
  previews?: boolean
  signal?: AbortSignal
  /** Drawn after the mask, clipped to one rectangle. Omit to leave the mask blank. */
  label?: { text: string; rect: NormalizedRect; rotation: StudyRotation } | null
}): Promise<FlatPage> {
  throwIfCancelled(options.signal)
  const page = await options.pdf.getPage(options.pageIndex + 1)
  let canvas: HTMLCanvasElement | null = null
  try {
    throwIfCancelled(options.signal)
    const base = page.getViewport({ scale: 1 })
    const choice = chooseRenderScale(base.width, base.height, {
      targetDpi: options.targetDpi,
      maxPixels: options.maxPixels,
      memoryPressure: options.memoryPressure,
    })
    const viewport = page.getViewport({ scale: choice.scale })
    const width = Math.max(1, Math.ceil(viewport.width))
    const height = Math.max(1, Math.ceil(viewport.height))
    canvas = options.canvasFactory(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not prepare the page canvas.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const task = page.render({ canvas, viewport, background: '#ffffff' })
    const onAbort = () => {
      task.cancel()
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    try {
      await task.promise
    } catch (error) {
      if (options.signal?.aborted || isRenderCancel(error)) throw new ProcessCancelled()
      throw error
    } finally {
      options.signal?.removeEventListener('abort', onAbort)
    }
    throwIfCancelled(options.signal)

    burnRedactions(ctx, canvas.width, canvas.height, options.rects)
    if (options.label) {
      burnStudyLabel(ctx, canvas.width, canvas.height, options.label.rect, options.label.text, options.label.rotation)
    }
    const png = await encodePng(canvas)
    const pdfBytes = await imageToSinglePagePdf(png, base.width, base.height)
    const previewBytes = options.previews === false ? null : await encodePreview(canvas, options.canvasFactory)
    return {
      pdfBytes,
      previewBytes,
      widthPt: base.width,
      heightPt: base.height,
      dpi: choice.dpi,
      capped: choice.capped,
    }
  } finally {
    if (canvas) releaseCanvas(canvas)
    page.cleanup()
  }
}

export async function encodePng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const node = canvas as HTMLCanvasElement & { toBuffer?: (format: string) => Uint8Array }
  if (typeof node.toBuffer === 'function') {
    return new Uint8Array(node.toBuffer('image/png'))
  }
  const blob = await canvasToBlob(canvas, 'image/png')
  return new Uint8Array(await blob.arrayBuffer())
}

export async function encodePreview(
  source: HTMLCanvasElement,
  factory: CanvasFactory,
  maxWidth = 720,
): Promise<Uint8Array> {
  const scale = Math.min(1, maxWidth / Math.max(source.width, 1))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const thumb = factory(width, height)
  try {
    const ctx = thumb.getContext('2d')
    if (!ctx) throw new Error('Could not prepare the thumbnail.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(source, 0, 0, width, height)
    const node = thumb as HTMLCanvasElement & { toBuffer?: (format: string, quality?: number) => Uint8Array }
    if (typeof node.toBuffer === 'function') {
      return new Uint8Array(node.toBuffer('image/jpeg', 72))
    }
    const blob = await canvasToBlob(thumb, 'image/jpeg', 0.72)
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    releaseCanvas(thumb)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Could not encode the page image.'))
      },
      type,
      quality,
    )
  })
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 1
  canvas.height = 1
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new ProcessCancelled()
}

function isRenderCancel(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'RenderingCancelledException' || error.name === 'AbortException'
}
