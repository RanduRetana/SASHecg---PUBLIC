import { createCanvas } from '@napi-rs/canvas'
import { expect, test } from 'bun:test'
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { anonymizeDocument } from './anonymize'
import type { CanvasFactory } from './flatten'
import { pageFileName } from './naming'
import { extractText, openPdf, readPageInfos } from './pdfDocument'
import { buildZip, readZip } from './zip'

const canvasFactory: CanvasFactory = (width, height) =>
  createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height))) as unknown as HTMLCanvasElement

const RECT = { x: 0, y: 0, width: 0.45, height: 0.3 }

test('100 input pages yield 100 PDFs and the marked text and pixels are gone', async () => {
  const source = await makeBatch(100)
  const opened = await openPdf(source)
  expect(opened.pdf.numPages).toBe(100)
  expect(await extractText(opened.pdf, 1)).toContain('PHI-SECRETO-XYZ')
  expect(await extractText(opened.pdf, 100)).toContain('PHI-SECRETO-XYZ')

  const result = await anonymizeDocument(opened.pdf, {
    pageCount: 100,
    defaultRects: [RECT],
    targetDpi: 72,
    previews: false,
    canvasFactory,
  })

  expect(result.cancelled).toBe(false)
  expect(result.failures).toEqual([])
  expect(result.pages).toHaveLength(100)
  expect(result.pages.map((page) => page.filename)).toEqual(
    Array.from({ length: 100 }, (_, index) => pageFileName(index + 1, 100)),
  )

  const zip = await buildZip(result.pages.map((page) => ({ name: page.filename, data: page.pdfBytes })))
  const files = readZip(zip)
  const names = Object.keys(files).sort()
  expect(names).toHaveLength(100)
  expect(names[0]).toBe('ecg-001.pdf')
  expect(names[99]).toBe('ecg-100.pdf')

  for (let index = 0; index < 100; index++) {
    const name = pageFileName(index + 1, 100)
    const bytes = files[name]
    expect(bytes, name).toBeDefined()
    if (!bytes) continue
    expect(new TextDecoder('latin1').decode(bytes).includes('PHI-SECRETO-XYZ')).toBe(false)
    expect(new TextDecoder('latin1').decode(bytes).includes('Dr Secreto')).toBe(false)

    const out = await openPdf(bytes)
    expect(out.pdf.numPages).toBe(1)
    const text = await extractText(out.pdf, 1)
    expect(text.includes('PHI-SECRETO-XYZ')).toBe(false)
    expect(text.includes('SAFE-TRAZO')).toBe(false)

    const page = await out.pdf.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    expect(viewport.width).toBeCloseTo(240, 0)
    expect(viewport.height).toBeCloseTo(320, 0)
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise
    const masked = ctx.getImageData(20, 20, 1, 1).data
    const kept = ctx.getImageData(120, 160, 1, 1).data
    expect([masked[0], masked[1], masked[2], masked[3]], `${name} mask`).toEqual([17, 17, 17, 255])
    expect(kept[2], `${name} trace`).toBeGreaterThan(200)
    expect(kept[0], `${name} trace`).toBeLessThan(40)
    page.cleanup()
    await out.destroy()
  }

  await opened.destroy()
}, 180000)

test('mixed sizes and a rotation drop the text and keep the visual page', async () => {
  const doc = await PDFDocument.create()
  doc.setTitle('PHI-SECRETO-XYZ')
  doc.setAuthor('Dr Secreto')
  const font = await doc.embedFont(StandardFonts.Helvetica)

  const tall = doc.addPage([240, 320])
  paintPage(tall, font, 240, 320)
  const wide = doc.addPage([360, 200])
  paintPage(wide, font, 360, 200)
  const turned = doc.addPage([240, 320])
  turned.setRotation(degrees(90))
  turned.drawText('PHI-SECRETO-XYZ', { x: 12, y: 280, size: 12, font })

  const opened = await openPdf(new Uint8Array(await doc.save()))
  const infos = await readPageInfos(opened.pdf)
  expect(infos.map((page) => [Math.round(page.widthPt), Math.round(page.heightPt), page.rotation])).toEqual([
    [240, 320, 0],
    [360, 200, 0],
    [320, 240, 90],
  ])

  const result = await anonymizeDocument(opened.pdf, {
    pageCount: 3,
    defaultRects: [RECT],
    targetDpi: 72,
    previews: false,
    canvasFactory,
  })
  expect(result.pages).toHaveLength(3)

  const expected = [
    [240, 320],
    [360, 200],
    [320, 240],
  ]
  for (let index = 0; index < result.pages.length; index++) {
    const bytes = result.pages[index]?.pdfBytes
    if (!bytes) throw new Error('missing page')
    expect(new TextDecoder('latin1').decode(bytes).includes('PHI-SECRETO-XYZ')).toBe(false)
    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBe(1)
    expect(loaded.getTitle()).toBe('SASHecg')
    expect(loaded.getAuthor() ?? '').not.toContain('Secreto')
    const size = loaded.getPage(0).getSize()
    expect(size.width).toBeCloseTo(expected[index]?.[0] ?? 0, 0)
    expect(size.height).toBeCloseTo(expected[index]?.[1] ?? 0, 0)

    const out = await openPdf(bytes)
    expect(await extractText(out.pdf, 1)).not.toContain('PHI-SECRETO-XYZ')
    const rendered = await out.pdf.getPage(1)
    const viewport = rendered.getViewport({ scale: 1 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    await rendered.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise
    const corner = ctx.getImageData(4, 4, 1, 1).data
    expect([corner[0], corner[1], corner[2], corner[3]]).toEqual([17, 17, 17, 255])
    rendered.cleanup()
    await out.destroy()
  }

  await opened.destroy()
}, 60000)

function paintPage(page: ReturnType<PDFDocument['addPage']>, font: Awaited<ReturnType<PDFDocument['embedFont']>>, width: number, height: number) {
  page.drawRectangle({ x: 0, y: height - 80, width: Math.min(100, width), height: 80, color: rgb(1, 0, 0) })
  page.drawText('PHI-SECRETO-XYZ', { x: 8, y: height - 36, size: 11, font, color: rgb(0, 0, 0) })
  page.drawRectangle({
    x: width / 2 - 25,
    y: height / 2 - 25,
    width: 50,
    height: 50,
    color: rgb(0, 0.2, 1),
  })
}

async function makeBatch(count: number) {
  const doc = await PDFDocument.create()
  doc.setTitle('PHI-SECRETO-XYZ')
  doc.setAuthor('Dr Secreto')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < count; index++) {
    const page = doc.addPage([240, 320])
    paintPage(page, font, 240, 320)
    page.drawText('SAFE-TRAZO', { x: 102, y: 156, size: 7, font, color: rgb(1, 1, 1) })
  }
  return new Uint8Array(await doc.save())
}
