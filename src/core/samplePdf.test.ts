import { createCanvas } from '@napi-rs/canvas'
import { expect, test } from 'bun:test'
import { anonymizeDocument } from './anonymize'
import type { CanvasFactory } from './flatten'
import { DEFAULT_REDACTION } from './geometry'
import { extractText, openPdf } from './pdfDocument'
import { PRACTICE_CASES, createSamplePdf } from './samplePdf'

const canvasFactory: CanvasFactory = (width, height) =>
  createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height))) as unknown as HTMLCanvasElement

test('the practice report has four varied pages and the default area removes every invented identity', async () => {
  expect(PRACTICE_CASES).toHaveLength(4)
  const names = new Set(PRACTICE_CASES.map((practice) => practice.name))
  const ids = new Set(PRACTICE_CASES.map((practice) => practice.id))
  const rates = new Set(PRACTICE_CASES.map((practice) => practice.hr))
  expect(names.size).toBe(4)
  expect(ids.size).toBe(4)
  expect(rates.size).toBe(4)

  const bytes = await createSamplePdf()
  const opened = await openPdf(bytes)
  expect(opened.pdf.numPages).toBe(4)
  const first = await opened.pdf.getPage(1)
  const viewport = first.getViewport({ scale: 1 })
  expect(viewport.width).toBeGreaterThan(viewport.height)
  first.cleanup()

  for (let index = 0; index < PRACTICE_CASES.length; index++) {
    const practice = PRACTICE_CASES[index]!
    const text = await extractText(opened.pdf, index + 1)
    expect(text).toContain(practice.name)
    expect(text).toContain(practice.id)
    expect(text).toContain(practice.phone)
    expect(text).toContain(practice.email)
    expect(text).toContain(practice.hr)
    expect(text).toContain(practice.diagnosis[0])
    expect(text).toContain('Synthetic practice report')
    expect(text).toContain(`Page ${index + 1} of 4`)
    expect(text).toContain('25 mm/s, 10 mm/mV')
    expect(text.toUpperCase()).not.toContain('SCHILLER')
    for (const other of PRACTICE_CASES) {
      if (other.id === practice.id) continue
      expect(text).not.toContain(other.name)
      expect(text).not.toContain(other.id)
    }
  }

  const before = await render(opened.pdf, 1)
  expect(darkFraction(before, 0, 0, 0.28, 0.14)).toBeLessThan(0.2)

  const result = await anonymizeDocument(opened.pdf, {
    pageCount: 4,
    defaultRects: [DEFAULT_REDACTION],
    targetDpi: 72,
    previews: false,
    canvasFactory,
  })
  expect(result.failures).toEqual([])
  expect(result.pages).toHaveLength(4)

  for (let index = 0; index < PRACTICE_CASES.length; index++) {
    const practice = PRACTICE_CASES[index]!
    const out = await openPdf(result.pages[index]!.pdfBytes)
    const hidden = await extractText(out.pdf, 1)
    expect(hidden).not.toContain(practice.name)
    expect(hidden).not.toContain(practice.id)
    expect(hidden).not.toContain(practice.phone)
    expect(hidden).not.toContain(practice.email)
    const after = await render(out.pdf, 1)
    const masked = after.context.getImageData(
      Math.round(0.12 * after.width),
      Math.round(0.06 * after.height),
      1,
      1,
    ).data
    expect([masked[0], masked[1], masked[2], masked[3]]).toEqual([17, 17, 17, 255])
    const trace = after.context.getImageData(Math.round(after.width * 0.45), Math.round(after.height * 0.55), 1, 1).data
    const traceIsMask = trace[0] === 17 && trace[1] === 17 && trace[2] === 17
    expect(traceIsMask).toBe(false)
    await out.destroy()
  }

  await opened.destroy()
}, 90000)

async function render(pdf: Awaited<ReturnType<typeof openPdf>>['pdf'], pageNumber: number) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const context = canvas.getContext('2d')
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise
  page.cleanup()
  return { context, width: canvas.width, height: canvas.height }
}

function darkFraction(
  image: { context: ReturnType<ReturnType<typeof createCanvas>['getContext']>; width: number; height: number },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const left = Math.round(x0 * image.width)
  const top = Math.round(y0 * image.height)
  const width = Math.max(1, Math.round((x1 - x0) * image.width))
  const height = Math.max(1, Math.round((y1 - y0) * image.height))
  const data = image.context.getImageData(left, top, width, height).data
  let dark = 0
  const pixels = width * height
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] < 40 && data[index + 1] < 40 && data[index + 2] < 40) dark += 1
  }
  return dark / pixels
}
