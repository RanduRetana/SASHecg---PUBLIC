import { createCanvas } from '@napi-rs/canvas'
import { expect, test } from 'bun:test'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { anonymizeDocument } from './anonymize'
import type { CanvasFactory } from './flatten'
import { extractText, openPdf, PdfOpenError } from './pdfDocument'
import { readZip, buildZip } from './zip'

const canvasFactory: CanvasFactory = (width, height) =>
  createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height))) as unknown as HTMLCanvasElement

test('an empty or unreadable PDF fails without leaving the device', async () => {
  await expect(openPdf(new Uint8Array())).rejects.toBeInstanceOf(PdfOpenError)
  try {
    await openPdf(new Uint8Array([1, 2, 3, 4, 5]))
    throw new Error('should have failed')
  } catch (error) {
    expect(error).toBeInstanceOf(PdfOpenError)
    expect((error as PdfOpenError).kind).toBe('invalid')
  }
})

test('a flattened page drops the text and metadata and covers the marked pixels', async () => {
  const source = await makeMarkedPdf(1)
  const opened = await openPdf(source)
  expect(await extractText(opened.pdf, 1)).toContain('PHI-SECRETO-XYZ')

  const result = await anonymizeDocument(opened.pdf, {
    pageCount: 1,
    defaultRects: [{ x: 0, y: 0, width: 0.45, height: 0.3 }],
    targetDpi: 72,
    previews: false,
    canvasFactory,
  })
  expect(result.cancelled).toBe(false)
  expect(result.failures).toEqual([])
  expect(result.pages).toHaveLength(1)

  const page = result.pages[0]
  expect(page?.filename).toBe('ecg-001.pdf')
  if (!page) throw new Error('missing page')
  expect(new TextDecoder('latin1').decode(page.pdfBytes).includes('PHI-SECRETO-XYZ')).toBe(false)
  expect(new TextDecoder('latin1').decode(page.pdfBytes).includes('Dr Secreto')).toBe(false)

  const packed = await PDFDocument.load(page.pdfBytes)
  expect(packed.getPageCount()).toBe(1)
  expect(packed.getTitle()).toBe('SASHecg')
  expect(packed.getAuthor() ?? '').toBe('')
  expect(packed.getPage(0).getSize().width).toBeCloseTo(240, 0)
  expect(packed.getPage(0).getSize().height).toBeCloseTo(320, 0)

  const out = await openPdf(page.pdfBytes)
  expect(await extractText(out.pdf, 1)).not.toContain('PHI-SECRETO-XYZ')
  const pixels = await renderPixels(out.pdf)
  expect(pixels.mask).toEqual([17, 17, 17, 255])
  expect(pixels.kept[2]).toBeGreaterThan(200)
  expect(pixels.kept[0]).toBeLessThan(40)
  await out.destroy()
  await opened.destroy()
})

test('an exception covers a different zone and leaves the shared corner alone', async () => {
  const source = await makeMarkedPdf(2)
  const opened = await openPdf(source)
  const result = await anonymizeDocument(opened.pdf, {
    pageCount: 2,
    defaultRects: [{ x: 0, y: 0, width: 0.45, height: 0.3 }],
    overrides: { 1: [{ x: 0.35, y: 0.35, width: 0.35, height: 0.35 }] },
    targetDpi: 72,
    previews: false,
    canvasFactory,
  })
  expect(result.pages.map((page) => page.exception)).toEqual([false, true])

  const first = await openPdf(result.pages[0]!.pdfBytes)
  const second = await openPdf(result.pages[1]!.pdfBytes)
  const a = await renderPixels(first.pdf)
  const b = await renderPixels(second.pdf)
  expect(a.mask).toEqual([17, 17, 17, 255])
  expect(a.kept[2]).toBeGreaterThan(200)
  expect(b.center).toEqual([17, 17, 17, 255])
  expect(b.mask[0]).toBeGreaterThan(200)
  await first.destroy()
  await second.destroy()
  await opened.destroy()
})

test('every invented identity region is removed, and an exception can carry its own set', async () => {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < 2; index++) {
    const page = doc.addPage([240, 320])
    page.drawRectangle({ x: 0, y: 240, width: 90, height: 80, color: rgb(1, 0, 0) })
    page.drawText('ID-ALPHA', { x: 8, y: 284, size: 11, font, color: rgb(0, 0, 0) })
    page.drawRectangle({ x: 150, y: 240, width: 90, height: 80, color: rgb(0, 0.55, 0) })
    page.drawText('ID-BETA', { x: 156, y: 284, size: 10, font, color: rgb(0, 0, 0) })
    page.drawRectangle({ x: 95, y: 135, width: 50, height: 50, color: rgb(0, 0.2, 1) })
  }
  const opened = await openPdf(new Uint8Array(await doc.save()))
  expect(await extractText(opened.pdf, 1)).toContain('ID-ALPHA')
  expect(await extractText(opened.pdf, 2)).toContain('ID-BETA')

  const left = { x: 0, y: 0, width: 0.4, height: 0.28 }
  const right = { x: 0.58, y: 0, width: 0.42, height: 0.28 }
  const lower = { x: 0.04, y: 0.78, width: 0.25, height: 0.14 }
  const result = await anonymizeDocument(opened.pdf, {
    pageCount: 2,
    defaultRects: [left, right],
    overrides: { 1: [right, lower] },
    targetDpi: 72,
    previews: false,
    canvasFactory,
  })
  expect(result.failures).toEqual([])
  expect(result.pages.map((page) => page.exception)).toEqual([false, true])
  expect(result.pages.map((page) => page.rects)).toEqual([[left, right], [right, lower]])

  const first = await openPdf(result.pages[0]!.pdfBytes)
  const second = await openPdf(result.pages[1]!.pdfBytes)
  const shared = await sample(first.pdf)
  const custom = await sample(second.pdf)
  expect(shared.left).toEqual([17, 17, 17, 255])
  expect(shared.right).toEqual([17, 17, 17, 255])
  expect(shared.kept[2]).toBeGreaterThan(200)
  expect(shared.lower[0]).toBeGreaterThan(200)
  expect(custom.left[0]).toBeGreaterThan(200)
  expect(custom.left[1]).toBeLessThan(40)
  expect(custom.right).toEqual([17, 17, 17, 255])
  expect(custom.lower).toEqual([17, 17, 17, 255])
  expect(custom.kept[2]).toBeGreaterThan(200)
  expect(new TextDecoder('latin1').decode(result.pages[0]!.pdfBytes).includes('ID-ALPHA')).toBe(false)
  expect(new TextDecoder('latin1').decode(result.pages[1]!.pdfBytes).includes('ID-BETA')).toBe(false)
  await first.destroy()
  await second.destroy()
  await opened.destroy()
})

test('processing can be cancelled and the ZIP rejects duplicate names', async () => {
  const source = await makeMarkedPdf(6)
  const opened = await openPdf(source)
  const controller = new AbortController()
  const result = await anonymizeDocument(opened.pdf, {
    pageCount: 6,
    defaultRects: [{ x: 0, y: 0, width: 0.2, height: 0.2 }],
    targetDpi: 72,
    previews: false,
    canvasFactory,
    signal: controller.signal,
    onProgress: (progress) => {
      if (progress.done >= 2) controller.abort()
    },
  })
  expect(result.cancelled).toBe(true)
  expect(result.pages.length).toBeLessThan(6)
  expect(result.pages.length).toBeGreaterThan(0)

  const zip = await buildZip(result.pages.map((page) => ({ name: page.filename, data: page.pdfBytes })))
  const files = readZip(zip)
  expect(Object.keys(files).length).toBe(result.pages.length)
  let duplicate = ''
  try {
    await buildZip([
      { name: 'ecg-001.pdf', data: new Uint8Array([1]) },
      { name: 'ecg-001.pdf', data: new Uint8Array([2]) },
    ])
  } catch (error) {
    duplicate = error instanceof Error ? error.message : ''
  }
  expect(duplicate).toContain('Duplicate')
  await opened.destroy()
})

async function makeMarkedPdf(count: number) {
  const doc = await PDFDocument.create()
  doc.setTitle('PHI-SECRETO-XYZ')
  doc.setAuthor('Dr Secreto')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < count; index++) {
    const page = doc.addPage([240, 320])
    page.drawRectangle({ x: 0, y: 240, width: 100, height: 80, color: rgb(1, 0, 0) })
    page.drawText('PHI-SECRETO-XYZ', { x: 8, y: 284, size: 11, font, color: rgb(0, 0, 0) })
    page.drawRectangle({ x: 95, y: 135, width: 50, height: 50, color: rgb(0, 0.2, 1) })
    page.drawText('SAFE-TRAZO', { x: 100, y: 154, size: 7, font, color: rgb(1, 1, 1) })
  }
  return new Uint8Array(await doc.save())
}

async function sample(pdf: Awaited<ReturnType<typeof openPdf>>['pdf']) {
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d')
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise
  const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data]
  page.cleanup()
  return {
    left: at(20, 20),
    right: at(180, 20),
    lower: at(30, 270),
    kept: at(120, 160),
  }
}

async function renderPixels(pdf: Awaited<ReturnType<typeof openPdf>>['pdf']) {
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d')
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise
  const mask = [...ctx.getImageData(20, 20, 1, 1).data]
  const center = [...ctx.getImageData(Math.round(viewport.width / 2), Math.round(viewport.height / 2), 1, 1).data]
  page.cleanup()
  return { mask, center, kept: center }
}
