import { useEffect, useMemo, useRef, useState } from 'react'
import { type ProcessedPage, type ProcessProgress } from '@/core/anonymize'
import { anonymizeBatch } from '@/core/batch'
import { createBrowserCanvas } from '@/core/browserCanvas'
import { downloadBytes } from '@/core/download'
import { createExportLock } from '@/core/exportLock'
import {
  DEFAULT_REDACTION,
  rectsForPage,
  replaceRectAt,
  roundRect,
  sameRectList,
  withNewRect,
  withoutRect,
  type NormalizedRect,
} from '@/core/geometry'
import { batchZipName, planOutputNames } from '@/core/naming'
import { openPdf, pagesDiffer, PdfOpenError, readPageInfos, type OpenedPdf, type PageInfo } from '@/core/pdfDocument'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { createSamplePdf } from '@/core/samplePdf'
import { browserMemoryPressure } from '@/core/scale'
import {
  activeStudyCode,
  expectedStudyMark,
  FRESH_STUDY,
  studyForBatch,
  studyGapsFor,
  studyMarksEqual,
  studyTargetRect,
  type StudyRotation,
  type StudySettings,
} from '@/core/studyCode'
import { buildZip } from '@/core/zip'

export type Stage = 0 | 1 | 2 | 3
export type Scope = 'all' | 'pages'

export type BatchPage = PageInfo & {
  localIndex: number
  fileId: number
  sourceName: string
  outputName: string
}

export type SkippedFile = { name: string; message: string }

export type DocumentInfo = {
  name: string
  size: number
  pageCount: number
  fileCount: number
  pages: BatchPage[]
  mixed: boolean
  skipped: SkippedFile[]
  disambiguated: boolean
}

const MAX_FILES = 1000
const MAX_FILE_BYTES = 512 * 1024 * 1024

type SourceRecord = { id: number; file: File; name: string }
type LoadedSource = { source: SourceRecord; pages: PageInfo[] }

export type PreviewPage = {
  index: number
  filename: string
  pdfBytes: Uint8Array
  previewUrl: string
  widthPt: number
  heightPt: number
  dpi: number
  rects: NormalizedRect[]
  exception: boolean
  warning?: string
  studyCode: string | null
  studyTargetId: string | null
  studyRotation: StudyRotation | null
}

export type PageFailure = { index: number; message: string }

type Slot = PreviewPage | null

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

function toPreview(page: ProcessedPage): PreviewPage {
  const bytes = page.previewBytes ?? new Uint8Array()
  const copy = new Uint8Array(bytes)
  const previewUrl = URL.createObjectURL(new Blob([copy.buffer], { type: 'image/jpeg' }))
  return {
    index: page.index,
    filename: page.filename,
    pdfBytes: page.pdfBytes,
    previewUrl,
    widthPt: page.widthPt,
    heightPt: page.heightPt,
    dpi: page.dpi,
    rects: page.rects.map((rect) => ({ ...rect })),
    exception: page.exception,
    studyCode: page.studyCode,
    studyTargetId: page.studyTargetId,
    studyRotation: page.studyRotation,
    ...(page.warning ? { warning: page.warning } : {}),
  }
}

function revoke(slots: Slot[]) {
  for (const slot of slots) {
    if (slot) URL.revokeObjectURL(slot.previewUrl)
  }
}

export function useSession() {
  const openedRef = useRef<OpenedPdf | null>(null)
  const openFileId = useRef(-1)
  const recordsRef = useRef<LoadedSource[]>([])
  const nextSourceId = useRef(1)
  const lockedQueue = useRef<File[]>([])
  const pendingSkipped = useRef<SkippedFile[]>([])
  const pendingFile = useRef<File | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const running = useRef<Promise<void> | null>(null)
  const exportLock = useRef(createExportLock())
  const anchor = useRef(0)

  const [stage, setStage] = useState<Stage>(0)
  const [doc, setDoc] = useState<DocumentInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [passwordNeeded, setPasswordNeeded] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [passwordFor, setPasswordFor] = useState<string | null>(null)
  const [loadProgress, setLoadProgress] = useState<{ done: number; total: number; name: string } | null>(null)
  const [defaultRects, setDefaultRects] = useState<NormalizedRect[]>([DEFAULT_REDACTION])
  const [overrides, setOverrides] = useState<Record<number, NormalizedRect[]>>({})
  const [selectedRect, setSelectedRect] = useState(0)
  const [scope, setScope] = useState<Scope>('all')
  const [selection, setSelection] = useState<number[]>([])
  const [editorPage, setEditorPage] = useState(0)
  const [slots, setSlots] = useState<Slot[]>([])
  const [failures, setFailures] = useState<PageFailure[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<ProcessProgress | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [active, setActive] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportName, setExportName] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [studyEnabled, setStudyEnabledState] = useState(FRESH_STUDY.enabled)
  const [studyCode, setStudyCode] = useState(FRESH_STUDY.code)
  const [studyTargetId, setStudyTargetId] = useState<string | null>(FRESH_STUDY.targetId)
  const [studyRotation, setStudyRotation] = useState<StudyRotation>(FRESH_STUDY.rotation)
  const [studyAckKey, setStudyAckKey] = useState<string | null>(null)

  const studySettings = useMemo<StudySettings>(
    () => ({ enabled: studyEnabled, code: studyCode, targetId: studyTargetId, rotation: studyRotation }),
    [studyEnabled, studyCode, studyTargetId, studyRotation],
  )

  const stale = useMemo(() => {
    return slots.some((slot) => {
      if (!slot) return false
      const rects = rectsForPage(slot.index, defaultRects, overrides).rects
      if (!sameRectList(slot.rects, rects)) return true
      return !studyMarksEqual(
        { code: slot.studyCode, targetId: slot.studyTargetId, rotation: slot.studyRotation },
        expectedStudyMark(studySettings, rects),
      )
    })
  }, [slots, defaultRects, overrides, studySettings])

  const studyGaps = useMemo(() => {
    if (!doc) return { unassigned: [] as number[], missingArea: [] as number[] }
    return studyGapsFor(doc.pageCount, studySettings, (index) => rectsForPage(index, defaultRects, overrides).rects)
  }, [doc, studySettings, defaultRects, overrides])
  const studyGapKey = `${studyGaps.unassigned.join(',')}|${studyGaps.missingArea.join(',')}`
  const studyNeedsAck = studySettings.enabled && (studyGaps.unassigned.length > 0 || studyGaps.missingArea.length > 0)
  const studyAcknowledged = studyNeedsAck && studyAckKey === studyGapKey

  const readyToExport = Boolean(
    doc &&
      !processing &&
      !stale &&
      failures.length === 0 &&
      slots.length === doc.pageCount &&
      slots.every((slot) => slot) &&
      (!studyNeedsAck || studyAcknowledged),
  )

  const maxStage: Stage = !doc ? 0 : !hasRun ? 1 : readyToExport ? 3 : 2

  const activeRects = scope === 'all' ? defaultRects : (overrides[editorPage] ?? defaultRects)
  const selectedIndex = Math.min(selectedRect, Math.max(0, activeRects.length - 1))
  const activeRect = activeRects[selectedIndex] ?? DEFAULT_REDACTION
  const targets = scope === 'all' ? [] : selection.length > 0 ? selection : [editorPage]

  const status = processing
    ? `Processing, ${progress?.done ?? 0} of ${progress?.total ?? 0} pages.`
    : exportName
      ? `Downloaded ${exportName}.`
      : fileError

  async function settleRunning() {
    abortRef.current?.abort()
    await running.current
  }

  function describeBatch(records: LoadedSource[], skipped: SkippedFile[]): DocumentInfo {
    const plan = planOutputNames(records.map((record) => ({ name: record.source.name, pageCount: record.pages.length })))
    const pages: BatchPage[] = []
    records.forEach((record, fileIndex) => {
      record.pages.forEach((page, localIndex) => {
        pages.push({
          index: pages.length,
          localIndex,
          fileId: record.source.id,
          sourceName: record.source.name,
          outputName: plan[fileIndex]?.names[localIndex] ?? `report-ecg-${pages.length + 1}.pdf`,
          widthPt: page.widthPt,
          heightPt: page.heightPt,
          rotation: page.rotation,
        })
      })
    })
    const fileCount = records.length
    return {
      name: fileCount === 1 ? (records[0]?.source.name ?? 'report.pdf') : `${fileCount} PDFs`,
      size: records.reduce((sum, record) => sum + record.source.file.size, 0),
      pageCount: pages.length,
      fileCount,
      pages,
      mixed: pagesDiffer(pages),
      skipped,
      disambiguated: plan.some((file) => file.disambiguated),
    }
  }

  async function releasePreview() {
    const previous = openedRef.current
    openedRef.current = null
    openFileId.current = -1
    setPdf(null)
    if (previous) void previous.destroy()
  }

  async function commitRecords(records: LoadedSource[], skipped: SkippedFile[], mode: 'replace' | 'append') {
    await settleRunning()
    await releasePreview()
    const next = mode === 'append' ? [...recordsRef.current, ...records] : records
    recordsRef.current = next
    const info = describeBatch(next, skipped)
    setSlots((current) => {
      revoke(current)
      return Array.from({ length: info.pageCount }, () => null)
    })
    setDoc(info)
    setFailures([])
    setCancelled(false)
    setHasRun(false)
    setExportError(null)
    setExportName(null)
    setProgress(null)
    setFileError(null)
    if (mode === 'replace') {
      setDefaultRects([DEFAULT_REDACTION])
      setSelectedRect(0)
      setOverrides({})
      setSelection([])
      setScope('all')
      setEditorPage(0)
      setActive(0)
      applyStudyBoundary('fresh')
    }
    setStage(1)
  }

  function applyStudyBoundary(boundary: 'fresh' | 'append') {
    const next = studyForBatch(studySettings, boundary)
    if (boundary === 'append') return
    setStudyEnabledState(next.enabled)
    setStudyCode(next.code)
    setStudyTargetId(next.targetId)
    setStudyRotation(next.rotation)
    setStudyAckKey(null)
  }

  async function scanFile(file: File, passwordValue?: string): Promise<LoadedSource> {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const opened = await openPdf(bytes, passwordValue)
    try {
      const pages = await readPageInfos(opened.pdf)
      if (pages.length === 0) throw new PdfOpenError('invalid', 'The PDF has no pages.')
      const source = { id: nextSourceId.current++, file, name: file.name || 'report.pdf' }
      return { source, pages }
    } finally {
      await opened.destroy()
    }
  }

  async function loadFiles(incoming: File[]) {
    const files = incoming.slice(0, MAX_FILES)
    setFileError(null)
    setLoading(true)
    setPasswordError(null)
    const accepted: LoadedSource[] = []
    const skipped: SkippedFile[] = []
    if (incoming.length > MAX_FILES) {
      skipped.push({ name: 'Extra files', message: `Only the first ${MAX_FILES} PDFs were kept.` })
    }
    const locked: File[] = []
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]
        if (!file) continue
        setLoadProgress({ done: index, total: files.length, name: file.name || 'PDF' })
        if (!isPdf(file)) {
          skipped.push({ name: file.name || 'Untitled', message: 'Not a PDF.' })
          continue
        }
        if (file.size === 0) {
          skipped.push({ name: file.name, message: 'The file is empty.' })
          continue
        }
        if (file.size > MAX_FILE_BYTES) {
          skipped.push({ name: file.name, message: 'The file is over 512 MB.' })
          continue
        }
        try {
          accepted.push(await scanFile(file))
        } catch (error) {
          if (error instanceof PdfOpenError && (error.kind === 'password' || error.kind === 'invalid-password')) {
            locked.push(file)
          } else if (error instanceof PdfOpenError) {
            skipped.push({ name: file.name, message: error.message })
          } else {
            skipped.push({ name: file.name, message: 'Could not open the file.' })
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      if (accepted.length === 0 && locked.length === 0) {
        setFileError(skipped[0] ? `${skipped[0].name}: ${skipped[0].message}` : 'No PDF could be opened.')
        setPasswordNeeded(false)
        return
      }
      if (accepted.length > 0) await commitRecords(accepted, skipped, 'replace')
      else pendingSkipped.current = skipped
      lockedQueue.current = locked
      const nextLocked = locked[0]
      if (nextLocked) {
        pendingFile.current = nextLocked
        setPasswordFor(nextLocked.name)
        setPasswordNeeded(true)
        setPassword('')
        setPasswordError(null)
      } else {
        pendingFile.current = null
        setPasswordFor(null)
        setPasswordNeeded(false)
      }
    } finally {
      setLoading(false)
      setLoadProgress(null)
    }
  }

  function reportFileError(message: string) {
    setFileError(message)
    setPasswordNeeded(false)
    setPasswordError(null)
  }

  async function loadFile(file: File) {
    await loadFiles([file])
  }

  async function submitPassword() {
    const file = pendingFile.current
    if (!file) return
    setLoading(true)
    setPasswordError(null)
    try {
      const loaded = await scanFile(file, password)
      const rest = lockedQueue.current.filter((item) => item !== file)
      lockedQueue.current = rest
      const skipped = recordsRef.current.length === 0 ? pendingSkipped.current : (doc?.skipped ?? [])
      await commitRecords([loaded], skipped, recordsRef.current.length === 0 ? 'replace' : 'append')
      pendingSkipped.current = []
      setPassword('')
      const nextLocked = rest[0]
      if (nextLocked) {
        pendingFile.current = nextLocked
        setPasswordFor(nextLocked.name)
        setPasswordNeeded(true)
      } else {
        pendingFile.current = null
        setPasswordFor(null)
        setPasswordNeeded(false)
      }
    } catch (error) {
      if (error instanceof PdfOpenError && error.kind === 'invalid-password') setPasswordError(error.message)
      else if (error instanceof PdfOpenError) setPasswordError(error.message)
      else setFileError('Could not open the file.')
    } finally {
      setLoading(false)
    }
  }

  async function loadSample() {
    setLoading(true)
    setFileError(null)
    try {
      const bytes = await createSamplePdf()
      const copy = new Uint8Array(bytes)
      const file = new File([copy.buffer], 'sample.pdf', { type: 'application/pdf' })
      await loadFiles([file])
    } catch {
      setFileError('Could not create the sample PDF.')
    } finally {
      setLoading(false)
    }
  }

  function writeRects(next: NormalizedRect[]) {
    const rounded = (next.length > 0 ? next : [DEFAULT_REDACTION]).map((rect) => roundRect(rect))
    if (scope === 'all') {
      setDefaultRects(rounded)
      return
    }
    const pages = selection.length > 0 ? selection : [editorPage]
    setOverrides((current) => {
      const copy = { ...current }
      for (const index of pages) copy[index] = rounded.map((rect) => ({ ...rect }))
      return copy
    })
  }

  function updateRectAt(index: number, rect: NormalizedRect) {
    writeRects(replaceRectAt(activeRects, index, rect))
  }

  function updateRect(rect: NormalizedRect) {
    updateRectAt(selectedIndex, rect)
  }

  function selectRect(index: number) {
    setSelectedRect(Math.min(Math.max(0, index), Math.max(0, activeRects.length - 1)))
  }

  function addRedaction() {
    const added = withNewRect(activeRects)
    setSelectedRect(added.selected)
    writeRects(added.rects)
  }

  function removeRedaction() {
    const removed = withoutRect(activeRects, selectedIndex)
    if (!removed) return
    setSelectedRect(removed.selected)
    writeRects(removed.rects)
  }

  function restoreStarting() {
    setSelectedRect(0)
    writeRects([DEFAULT_REDACTION])
  }

  function clearExceptions(indices: number[]) {
    setOverrides((current) => {
      const copy = { ...current }
      for (const index of indices) delete copy[index]
      return copy
    })
  }

  function editPages(indices: number[]) {
    if (indices.length === 0 || !doc) return
    const page = indices[0] ?? 0
    setSelection(indices)
    setEditorPage(page)
    setScope('pages')
    setStage(1)
  }

  async function process(indices?: number[]) {
    if (!doc || processing) return
    const wanted = new Set(indices ?? doc.pages.map((page) => page.index))
    const grouped = new Map<number, BatchPage[]>()
    for (const page of doc.pages) {
      if (!wanted.has(page.index)) continue
      const list = grouped.get(page.fileId) ?? []
      list.push(page)
      grouped.set(page.fileId, list)
    }
    const inputs = [...grouped.entries()].flatMap(([fileId, pages]) => {
      const record = recordsRef.current.find((item) => item.source.id === fileId)
      if (!record) return []
      return [{
        load: async () => new Uint8Array(await record.source.file.arrayBuffer()),
        pages: pages.map((page) => ({
          localIndex: page.localIndex,
          globalIndex: page.index,
          filename: page.outputName,
        })),
      }]
    })
    const controller = new AbortController()
    abortRef.current = controller
    setProcessing(true)
    setCancelled(false)
    setExportName(null)
    setExportError(null)
    setProgress({ done: 0, total: wanted.size, pageIndex: indices?.[0] ?? 0, dpi: 0 })

    const job = (async () => {
      let result
      try {
        result = await anonymizeBatch(inputs, {
          defaultRects,
          overrides,
          signal: controller.signal,
          canvasFactory: createBrowserCanvas,
          previews: true,
          memoryPressure: browserMemoryPressure,
          study: studySettings,
          labelFor: (globalIndex) => doc.pages[globalIndex]?.sourceName,
          onProgress: setProgress,
        })
      } catch {
        setFileError('Processing stopped because of an unexpected error.')
        setHasRun(true)
        return
      }
      setSlots((current) => {
        const base: Slot[] = indices ? current.slice() : Array.from({ length: doc.pageCount }, () => null)
        while (base.length < doc.pageCount) base.push(null)
        if (indices) {
          for (const page of result.pages) {
            const previous = current[page.index]
            if (previous) URL.revokeObjectURL(previous.previewUrl)
          }
        } else {
          revoke(current)
        }
        for (const page of result.pages) base[page.index] = toPreview(page)
        return base
      })
      setFailures((current) => {
        if (!indices) return result.failures
        const retried = new Set(indices)
        return [...current.filter((failure) => !retried.has(failure.index)), ...result.failures]
      })
      setCancelled(result.cancelled)
      setHasRun(true)
      setStage(2)
      if (indices && indices[0] !== undefined) setActive(indices[0])
    })()

    running.current = job
    try {
      await job
    } finally {
      if (running.current === job) running.current = null
      abortRef.current = null
      setProcessing(false)
    }
  }

  async function exportZip() {
    if (!doc || !readyToExport) return
    setExportError(null)
    const name = await exportLock.current.run(async () => {
      setExporting(true)
      try {
        const files = slots.flatMap((slot) => (slot ? [{ name: slot.filename, data: slot.pdfBytes }] : []))
        const zip = await buildZip(files)
        const filename = batchZipName(recordsRef.current.map((record) => record.source.name))
        downloadBytes(zip, filename, 'application/zip')
        return filename
      } catch {
        setExportError('Could not create the ZIP. Try again.')
        return null
      } finally {
        setExporting(false)
      }
    })
    if (name) setExportName(name)
  }

  async function reset() {
    await settleRunning()
    const previous = openedRef.current
    openedRef.current = null
    setPdf(null)
    if (previous) queueMicrotask(() => void previous.destroy())
    pendingFile.current = null
    recordsRef.current = []
    lockedQueue.current = []
    pendingSkipped.current = []
    openFileId.current = -1
    setPasswordFor(null)
    setLoadProgress(null)
    setSlots((current) => {
      revoke(current)
      return []
    })
    setDoc(null)
    setStage(0)
    setDefaultRects([DEFAULT_REDACTION])
    setOverrides({})
    setSelectedRect(0)
    setFailures([])
    setCancelled(false)
    setHasRun(false)
    setProcessing(false)
    setProgress(null)
    setPassword('')
    setPasswordNeeded(false)
    setPasswordError(null)
    setFileError(null)
    setExportError(null)
    setExportName(null)
    setSelection([])
    setScope('all')
    setEditorPage(0)
    setActive(0)
    setConfirmReset(false)
    setLoading(false)
    applyStudyBoundary('fresh')
  }

  function setStudyEnabled(enabled: boolean) {
    setStudyEnabledState(enabled)
  }

  function setStudyAcknowledged(checked: boolean) {
    setStudyAckKey(checked ? studyGapKey : null)
  }

  function cancel() {
    abortRef.current?.abort()
  }

  function changeScope(next: Scope) {
    setScope(next)
    if (next === 'pages' && selection.length === 0) setSelection([editorPage])
  }

  function stepEditor(delta: number) {
    if (!doc) return
    if (scope === 'pages' && selection.length > 1) {
      const ordered = [...selection].sort((a, b) => a - b)
      const pos = Math.max(0, ordered.indexOf(editorPage))
      const next = ordered[(pos + delta + ordered.length) % ordered.length]
      if (next !== undefined) setEditorPage(next)
      return
    }
    const next = Math.min(doc.pageCount - 1, Math.max(0, editorPage + delta))
    setEditorPage(next)
    if (scope === 'pages') setSelection([next])
  }

  function goTo(next: number) {
    if (next < 0 || next > maxStage) return
    setStage(next as Stage)
  }

  function toggleSelected(index: number, shift: boolean) {
    setActive(index)
    if (shift) {
      const start = Math.min(anchor.current, index)
      const end = Math.max(anchor.current, index)
      const range: number[] = []
      for (let page = start; page <= end; page++) range.push(page)
      setSelection(range)
      return
    }
    anchor.current = index
    setSelection((current) => (current.includes(index) ? current.filter((page) => page !== index) : [...current, index]))
  }

  useEffect(() => {
    const page = doc?.pages[editorPage]
    if (!page) return
    if (openFileId.current === page.fileId && openedRef.current) return
    const record = recordsRef.current.find((item) => item.source.id === page.fileId)
    if (!record) return
    const token = { cancelled: false }
    void (async () => {
      try {
        const bytes = new Uint8Array(await record.source.file.arrayBuffer())
        if (token.cancelled) return
        const opened = await openPdf(bytes)
        if (token.cancelled) {
          await opened.destroy()
          return
        }
        const previous = openedRef.current
        openedRef.current = opened
        openFileId.current = page.fileId
        setPdf(opened.pdf)
        if (previous && previous !== opened) void previous.destroy()
      } catch {
        if (!token.cancelled) setFileError('Could not open this page for preview.')
      }
    })()
    return () => {
      token.cancelled = true
    }
  }, [doc, editorPage])

  const warnings = slots.flatMap((slot) => (slot?.warning ? [slot.warning] : []))
  const studyCodeActive = activeStudyCode(studySettings)
  const studyPreview =
    studyCodeActive && studyTargetRect(activeRects, studyTargetId)
      ? { text: studyCodeActive, targetId: studyTargetId ?? '', rotation: studyRotation }
      : null

  return {
    stage,
    maxStage,
    goTo,
    doc,
    pdf,
    loading,
    fileError,
    passwordNeeded,
    passwordError,
    password,
    setPassword,
    loadFile,
    loadFiles,
    reportFileError,
    passwordFor,
    loadProgress,
    submitPassword,
    loadSample,
    defaultRects,
    overrides,
    activeRects,
    selectedIndex,
    selectRect,
    addRedaction,
    removeRedaction,
    restoreStarting,
    canRemoveRect: activeRects.length > 1,
    scope,
    setScope: changeScope,
    stepEditor,
    selection,
    setSelection,
    editorPage,
    setEditorPage,
    activeRect,
    targets,
    updateRect,
    updateRectAt,
    clearExceptions,
    editPages,
    slots,
    failures,
    processing,
    progress,
    hasRun,
    cancel,
    cancelled,
    stale,
    readyToExport,
    active,
    setActive,
    toggleSelected,
    process,
    exporting,
    exportError,
    exportName,
    exportZip,
    confirmReset,
    setConfirmReset,
    reset,
    warnings,
    status,
    studyEnabled,
    setStudyEnabled,
    studyCode,
    setStudyCode,
    studyTargetId,
    setStudyTargetId,
    studyRotation,
    setStudyRotation,
    studyPreview,
    studyGaps,
    studyNeedsAck,
    studyAcknowledged,
    setStudyAcknowledged,
    studyMissingCount: studyGaps.missingArea.length,
  }
}

export type Session = ReturnType<typeof useSession>
