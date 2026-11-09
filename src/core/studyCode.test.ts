import { createCanvas } from '@napi-rs/canvas'
import { expect, test } from 'bun:test'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { anonymizeBatch } from './batch'
import { anonymizeDocument } from './anonymize'
import type { CanvasFactory } from './flatten'
import { DEFAULT_REDACTION, nextAreaId, normalizedToPixels, withNewRect, withoutRect, type NormalizedRect } from './geometry'
import { burnRedactions } from './redact'
import { extractText, openPdf } from './pdfDocument'
import {
  activeStudyCode,
  burnStudyLabel,
  cleanStudyCode,
  expectedStudyMark,
  FRESH_STUDY,
  studyForBatch,
  studyGapsFor,
  studyTargetRect,
  type StudyRotation,
  type StudySettings,
} from './studyCode'

const canvasFactory: CanvasFactory = (width, height) =>
  createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height))) as unknown as HTMLCanvasElement

const header: NormalizedRect = { id: 'area-1', x: 0, y: 0, width: 0.46, height: 0.28 }
const corner: NormalizedRect = { id: 'area-2', x: 0.7, y: 0.7, width: 0.24, height: 0.2 }

function settings(overrides: Partial<StudySettings> = {}): StudySettings {
  return {
    enabled: true,
    code: '8805-001',
    targetId: 'area-1',
    rotation: 0,
    ...overrides,
  }
}

test('a typed code keeps leading zeros and is not turned into the next number', () => {
  expect(cleanStudyCode('8805-001')).toBe('8805-001')
  expect(cleanStudyCode('  8805-0001  ')).toBe('8805-0001')
  expect(cleanStudyCode('001')).toBe('001')
  expect(cleanStudyCode('8805-001\n')).toBe('8805-001')
  expect(cleanStudyCode('x'.repeat(80))).toHaveLength(64)
  expect(activeStudyCode(settings({ code: '8805-001' }))).toBe('8805-001')
  expect(activeStudyCode(settings({ code: '   ' }))).toBe(null)
  expect(activeStudyCode(settings({ enabled: false, code: '8805-001' }))).toBe(null)
})

test('one code covers every page, and a new batch clears it instead of carrying it over', () => {
  const current = settings({ targetId: 'area-2', rotation: 90 })
  expect(activeStudyCode(current)).toBe('8805-001')
  expect(expectedStudyMark(current, [header, corner]).code).toBe('8805-001')
  expect(expectedStudyMark(current, [corner]).code).toBe('8805-001')

  const appended = studyForBatch(current, 'append')
  expect(appended).toEqual(current)
  expect(activeStudyCode(appended)).toBe('8805-001')

  const fresh = studyForBatch(current, 'fresh')
  expect(fresh).toEqual(FRESH_STUDY)
  expect(fresh.code).toBe('')
  expect(fresh.enabled).toBe(false)
  expect(activeStudyCode(fresh)).toBe(null)
  expect(cleanStudyCode('8805-002')).toBe('8805-002')
  expect(cleanStudyCode('8805-002')).not.toBe(cleanStudyCode('8805-001'))
})

test('a missing or removed area does not move the code onto another rectangle', () => {
  const rects = [header, corner]
  expect(studyTargetRect(rects, 'area-2')?.id).toBe('area-2')
  expect(studyTargetRect([corner, header], 'area-1')?.id).toBe('area-1')
  expect(studyTargetRect(rects, 'area-9')).toBe(null)
  expect(expectedStudyMark(settings({ targetId: 'area-9' }), rects)).toEqual({
    code: null,
    targetId: null,
    rotation: null,
  })

  const removed = withoutRect(rects, 0)
  expect(removed).not.toBe(null)
  expect(studyTargetRect(removed!.rects, 'area-1')).toBe(null)
  expect(studyTargetRect(removed!.rects, 'area-2')?.id).toBe('area-2')
  expect(expectedStudyMark(settings({ targetId: 'area-2' }), removed!.rects).targetId).toBe('area-2')
})

test('new areas receive a fresh id and the default id stays put', () => {
  expect(DEFAULT_REDACTION.id).toBe('area-1')
  const added = withNewRect([DEFAULT_REDACTION])
  expect(added.rects[1]?.id).toBe('area-2')
  expect(nextAreaId(added.rects)).toBe('area-3')
  expect(studyTargetRect(added.rects, 'area-1')?.x).toBe(0)
})

test('an empty code warns for every page, and a page-specific area can refuse the label', () => {
  const empty = studyGapsFor(3, settings({ code: '' }), () => [header])
  expect(empty.unassigned).toEqual([0, 1, 2])
  expect(empty.missingArea).toEqual([])

  const gaps = studyGapsFor(3, settings(), (index) => (index === 1 ? [corner] : [header]))
  expect(gaps.unassigned).toEqual([])
  expect(gaps.missingArea).toEqual([1])
  expect(studyGapsFor(2, settings({ enabled: false }), () => [corner])).toEqual({
    unassigned: [],
    missingArea: [],
  })
})

test('the code is painted inside the mask after the source pixels are gone', () => {
  for (const rotation of [0, 90, 180, 270] as StudyRotation[]) {
    const canvas = createCanvas(360, 240)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 360, 240)
    const area = normalizedToPixels(header, 360, 240)
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(area.x, area.y, area.width, area.height)
    burnRedactions(ctx as unknown as CanvasRenderingContext2D, 360, 240, [header])
    const drawn = burnStudyLabel(
      ctx as unknown as CanvasRenderingContext2D,
      360,
      240,
      header,
      '8805-001',
      rotation,
    )
    expect(drawn).not.toBe(null)
    const stats = inspect(ctx, 360, 240, header)
    expect(stats.outsideDirty, `rotation ${rotation}`).toBe(0)
    expect(stats.red, `rotation ${rotation}`).toBe(0)
    expect(stats.light, `rotation ${rotation}`).toBeGreaterThan(8)
    expect(stats.mask, `rotation ${rotation}`).toBeGreaterThan(20)
  }
})

test('a tiny area still cannot spill the code onto the page', () => {
  const canvas = createCanvas(200, 200)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 200, 200)
  const tiny: NormalizedRect = { id: 'area-1', x: 0.4, y: 0.4, width: 0.08, height: 0.05 }
  burnRedactions(ctx as unknown as CanvasRenderingContext2D, 200, 200, [tiny])
  burnStudyLabel(ctx as unknown as CanvasRenderingContext2D, 200, 200, tiny, '8805-001-VERY-LONG-CODE', 90)
  expect(inspect(ctx, 200, 200, tiny).outsideDirty).toBe(0)
})

test('every page in a batch gets the same burned code, and a page without that area does not', async () => {
  const source = await markedPdf(2)
  const opened = await openPdf(source)
  const shared = settings()
  const result = await anonymizeDocument(opened.pdf, {
    pageCount: 2,
    defaultRects: [header, corner],
    overrides: { 1: [{ id: 'area-9', x: 0, y: 0, width: 0.46, height: 0.28 }] },
    targetDpi: 72,
    previews: false,
    canvasFactory,
    study: shared,
  })
  expect(result.failures).toEqual([])
  expect(result.pages.map((page) => page.studyCode)).toEqual(['8805-001', null])
  expect(result.pages[0]?.studyTargetId).toBe('area-1')
  expect(result.pages[1]?.studyTargetId).toBe(null)

  const firstOut = await openPdf(result.pages[0]!.pdfBytes)
  const secondOut = await openPdf(result.pages[1]!.pdfBytes)
  expect(await extractText(firstOut.pdf, 1)).not.toContain('8805-001')
  expect(await extractText(firstOut.pdf, 1)).not.toContain('PHI-SECRET')
  expect(await extractText(secondOut.pdf, 1)).not.toContain('8805-001')
  expect(await extractText(secondOut.pdf, 1)).not.toContain('PHI-SECRET')
  expect(new TextDecoder('latin1').decode(result.pages[0]!.pdfBytes).includes('PHI-SECRET')).toBe(false)
  const labeled = await render(firstOut.pdf)
  const unlabeled = await render(secondOut.pdf)
  expect(labeled.light).toBeGreaterThan(4)
  expect(labeled.red).toBe(0)
  expect(unlabeled.light).toBe(0)
  expect(unlabeled.mask).toBeGreaterThan(10)
  expect(unlabeled.red).toBe(0)
  await firstOut.destroy()
  await secondOut.destroy()
  await opened.destroy()

  const alpha = await markedPdf(1)
  const beta = await markedPdf(1)
  const batch = await anonymizeBatch(
    [
      { load: async () => alpha, pages: [{ localIndex: 0, globalIndex: 0, filename: 'batch-a-ecg-001.pdf' }] },
      { load: async () => beta, pages: [{ localIndex: 0, globalIndex: 1, filename: 'batch-b-ecg-001.pdf' }] },
    ],
    {
      defaultRects: [header],
      targetDpi: 72,
      previews: false,
      canvasFactory,
      study: settings(),
    },
  )
  expect(batch.pages.map((page) => page.studyCode)).toEqual(['8805-001', '8805-001'])
  const nextBatch = await anonymizeBatch(
    [{ load: async () => alpha, pages: [{ localIndex: 0, globalIndex: 0, filename: 'batch-a-ecg-001.pdf' }] }],
    {
      defaultRects: [header],
      targetDpi: 72,
      previews: false,
      canvasFactory,
      study: settings({ code: '8805-002' }),
    },
  )
  expect(studyForBatch(settings(), 'fresh').code).toBe('')
  expect(nextBatch.pages[0]?.studyCode).toBe('8805-002')
  const previousImage = await openPdf(batch.pages[0]!.pdfBytes)
  const nextImage = await openPdf(nextBatch.pages[0]!.pdfBytes)
  const previousPixels = await render(previousImage.pdf)
  const nextPixels = await render(nextImage.pdf)
  expect(previousPixels.signature).not.toBe(nextPixels.signature)
  expect(await extractText(nextImage.pdf, 1)).not.toContain('8805-002')
  await previousImage.destroy()
  await nextImage.destroy()
})

function inspect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  width: number,
  height: number,
  rect: NormalizedRect,
) {
  const data = ctx.getImageData(0, 0, width, height).data
  const area = normalizedToPixels(rect, width, height)
  let outsideDirty = 0
  let light = 0
  let mask = 0
  let red = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const pixel = [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0]
      const inside = x >= area.x && y >= area.y && x < area.x + area.width && y < area.y + area.height
      if (!inside) {
        if (pixel[0] !== 255 || pixel[1] !== 255 || pixel[2] !== 255) outsideDirty += 1
        continue
      }
      if (pixel[0] > 220 && pixel[1] > 220 && pixel[2] > 220) light += 1
      if (pixel[0] === 17 && pixel[1] === 17 && pixel[2] === 17) mask += 1
      if (pixel[0] > 200 && pixel[1] < 40 && pixel[2] < 40) red += 1
    }
  }
  return { outsideDirty, light, mask, red }
}

async function render(pdf: Awaited<ReturnType<typeof openPdf>>['pdf']) {
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d')
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise
  const stats = inspect(ctx, canvas.width, canvas.height, header)
  let signature = 0
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  for (let index = 0; index < data.length; index += 16) signature = (signature + (data[index] ?? 0)) % 100000
  page.cleanup()
  return { ...stats, signature }
}

async function markedPdf(count: number) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < count; index++) {
    const page = doc.addPage([360, 240])
    page.drawRectangle({ x: 12, y: 180, width: 140, height: 48, color: rgb(1, 0, 0) })
    page.drawText('PHI-SECRET', { x: 18, y: 198, size: 14, font, color: rgb(0, 0, 0) })
    page.drawRectangle({ x: 180, y: 40, width: 40, height: 40, color: rgb(0, 0.2, 1) })
  }
  return new Uint8Array(await doc.save())
}
