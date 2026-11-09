import type { PDFDocumentProxy } from 'pdfjs-dist'
import { rectsForPage, type NormalizedRect } from './geometry'
import { flattenPage, ProcessCancelled, type CanvasFactory } from './flatten'
import { pageFileName } from './naming'
import { expectedStudyMark, studyTargetRect, type StudyMark, type StudySettings } from './studyCode'

export type ProcessedPage = {
  index: number
  filename: string
  pdfBytes: Uint8Array
  previewBytes: Uint8Array | null
  widthPt: number
  heightPt: number
  dpi: number
  rects: NormalizedRect[]
  exception: boolean
  warning?: string
  studyCode: string | null
  studyTargetId: string | null
  studyRotation: StudyMark['rotation']
}

export type PageFailure = {
  index: number
  message: string
}

export type ProcessProgress = {
  done: number
  total: number
  pageIndex: number
  dpi: number
  warning?: string
  label?: string
}

export type AnonymizeResult = {
  pages: ProcessedPage[]
  failures: PageFailure[]
  cancelled: boolean
}

export async function anonymizeDocument(
  pdf: PDFDocumentProxy,
  options: {
    pageCount: number
    defaultRects: readonly NormalizedRect[]
    overrides?: Readonly<Record<number, readonly NormalizedRect[] | undefined>>
    indices?: number[]
    /** Local page index to ZIP entry name. Defaults to ecg-001.pdf. */
    filenames?: Readonly<Record<number, string>>
    /** Local page index to the batch-wide page index stored on the result. */
    globalIndexes?: Readonly<Record<number, number>>
    targetDpi?: number
    maxPixels?: number
    signal?: AbortSignal
    canvasFactory: CanvasFactory
    previews?: boolean
    memoryPressure?: () => boolean
    onProgress?: (progress: ProcessProgress) => void
    study?: StudySettings
  },
): Promise<AnonymizeResult> {
  const indices = options.indices ?? Array.from({ length: options.pageCount }, (_, index) => index)
  const pages: ProcessedPage[] = []
  const failures: PageFailure[] = []
  let memoryPressure = false

  for (let cursor = 0; cursor < indices.length; cursor++) {
    if (options.signal?.aborted) {
      return { pages, failures, cancelled: true }
    }
    const index = indices[cursor]
    if (index === undefined) continue
    const { rects, exception } = rectsForPage(index, options.defaultRects, options.overrides)
    if (!memoryPressure && options.memoryPressure?.()) memoryPressure = true
    const storedIndex = options.globalIndexes?.[index] ?? index
    const mark = expectedStudyMark(options.study, rects)
    const target = mark.code ? studyTargetRect(rects, mark.targetId) : null

    try {
      const flat = await flattenPage({
        pdf,
        pageIndex: index,
        rects,
        canvasFactory: options.canvasFactory,
        targetDpi: options.targetDpi,
        maxPixels: options.maxPixels,
        memoryPressure,
        previews: options.previews,
        signal: options.signal,
        label: mark.code && target && mark.rotation !== null ? { text: mark.code, rect: target, rotation: mark.rotation } : null,
      })
      const warning = flat.capped
        ? `Page ${storedIndex + 1} was rasterized at ${Math.round(flat.dpi)} dpi to stay within memory. The usual target is 200–300 dpi.`
        : undefined
      pages.push({
        index: storedIndex,
        filename: options.filenames?.[index] ?? pageFileName(index + 1, options.pageCount),
        pdfBytes: flat.pdfBytes,
        previewBytes: flat.previewBytes,
        widthPt: flat.widthPt,
        heightPt: flat.heightPt,
        dpi: flat.dpi,
        rects,
        exception,
        studyCode: mark.code,
        studyTargetId: mark.targetId,
        studyRotation: mark.rotation,
        ...(warning ? { warning } : {}),
      })
      options.onProgress?.({
        done: cursor + 1,
        total: indices.length,
        pageIndex: storedIndex,
        dpi: flat.dpi,
        ...(warning ? { warning } : {}),
      })
    } catch (error) {
      if (error instanceof ProcessCancelled || options.signal?.aborted) {
        return { pages, failures, cancelled: true }
      }
      const storedIndex = options.globalIndexes?.[index] ?? index
      failures.push({
        index: storedIndex,
        message: error instanceof Error ? error.message : 'Could not anonymize the page.',
      })
      options.onProgress?.({
        done: cursor + 1,
        total: indices.length,
        pageIndex: storedIndex,
        dpi: 0,
      })
    }

    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return { pages, failures, cancelled: false }
}
