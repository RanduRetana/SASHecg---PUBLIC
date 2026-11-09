import type { NormalizedRect } from './geometry'
import { normalizedToPixels } from './geometry'

export const STUDY_ROTATIONS = [0, 90, 180, 270] as const
export type StudyRotation = (typeof STUDY_ROTATIONS)[number]

/** White on the charcoal mask. High contrast, and not a second clinical color. */
export const STUDY_LABEL_COLOR = '#ffffff'
export const STUDY_FONT_FAMILY = '"Geist Sans", ui-sans-serif, system-ui, sans-serif'
export const STUDY_CODE_MAX = 64

/** One optional code for every PDF and every page in the current batch. */
export type StudySettings = {
  enabled: boolean
  /** Exactly what the user typed, apart from surrounding whitespace and control characters. */
  code: string
  targetId: string | null
  rotation: StudyRotation
}

/** A new upload starts here. The previous code is not kept and the next number is not invented. */
export const FRESH_STUDY: StudySettings = {
  enabled: false,
  code: '',
  targetId: 'area-1',
  rotation: 0,
}

export type StudyMark = {
  code: string | null
  targetId: string | null
  rotation: StudyRotation | null
}

export const EMPTY_STUDY_MARK: StudyMark = { code: null, targetId: null, rotation: null }

/**
 * `fresh` is a new upload or a reset: the code is cleared and the option turns off.
 * `append` is another file joining the batch already open, so the same code stays.
 */
export function studyForBatch(current: StudySettings, boundary: 'fresh' | 'append'): StudySettings {
  if (boundary === 'append') return current
  return { ...FRESH_STUDY }
}

/**
 * Trim the ends and drop control characters. Digits are kept as typed, including leading zeros.
 * This does not invent the next code and does not decide whether the text is a safe pseudonym.
 */
export function cleanStudyCode(value: string): string {
  let cleaned = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code <= 31 || code === 127) continue
    cleaned += char
  }
  return cleaned.trim().slice(0, STUDY_CODE_MAX)
}

/** The code burned on every page in the batch, or null when the option is off or the field is empty. */
export function activeStudyCode(settings: StudySettings | undefined): string | null {
  if (!settings?.enabled) return null
  const code = cleanStudyCode(settings.code)
  return code || null
}

/**
 * The rectangle that should receive the code. A missing id draws nothing.
 * It does not fall back to another area.
 */
export function studyTargetRect(rects: readonly NormalizedRect[], targetId: string | null): NormalizedRect | null {
  if (!targetId) return null
  return rects.find((rect) => rect.id === targetId) ?? null
}

export function expectedStudyMark(settings: StudySettings | undefined, rects: readonly NormalizedRect[]): StudyMark {
  const code = activeStudyCode(settings)
  const target = code ? studyTargetRect(rects, settings?.targetId ?? null) : null
  if (!code || !settings || !target?.id) return EMPTY_STUDY_MARK
  return { code, targetId: target.id, rotation: settings.rotation }
}

export function studyMarksEqual(actual: StudyMark, expected: StudyMark): boolean {
  return actual.code === expected.code && actual.targetId === expected.targetId && actual.rotation === expected.rotation
}

export type StudyGaps = {
  /** Every page, when the option is on and the field is empty. */
  unassigned: number[]
  /** Pages whose own areas do not include the chosen rectangle. The code is not drawn there. */
  missingArea: number[]
}

export function studyGapsFor(
  pageCount: number,
  settings: StudySettings,
  rectsFor: (pageIndex: number) => readonly NormalizedRect[],
): StudyGaps {
  const unassigned: number[] = []
  const missingArea: number[] = []
  if (!settings.enabled) return { unassigned, missingArea }
  if (!activeStudyCode(settings)) {
    for (let index = 0; index < pageCount; index++) unassigned.push(index)
    return { unassigned, missingArea }
  }
  for (let index = 0; index < pageCount; index++) {
    if (!studyTargetRect(rectsFor(index), settings.targetId)) missingArea.push(index)
  }
  return { unassigned, missingArea }
}

type LabelContext = {
  save(): void
  restore(): void
  beginPath(): void
  rect(x: number, y: number, w: number, h: number): void
  clip(): void
  translate(x: number, y: number): void
  rotate(angle: number): void
  fillText(text: string, x: number, y: number): void
  measureText(text: string): { width: number }
  font: string
  fillStyle: string | CanvasGradient | CanvasPattern
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  globalAlpha: number
  globalCompositeOperation: GlobalCompositeOperation
}

export function studyFont(px: number): string {
  return `600 ${px}px ${STUDY_FONT_FAMILY}`
}

/**
 * Largest font that keeps the full code inside the rectangle after rotation.
 * Size is a fraction of the rectangle, so a screen preview and the 220 dpi burn match.
 */
export function fitStudyFont(
  ctx: Pick<LabelContext, 'font' | 'measureText'>,
  text: string,
  boxWidth: number,
  boxHeight: number,
): { fontPx: number; cramped: boolean } {
  const availW = Math.max(1, boxWidth * 0.84)
  const availH = Math.max(1, boxHeight * 0.8)
  const preferred = availH
  let lo = 1
  let hi = preferred
  let best = 1
  for (let step = 0; step < 14; step++) {
    const mid = (lo + hi) / 2
    ctx.font = studyFont(mid)
    const measured = ctx.measureText(text).width
    const width = measured > 0 ? measured : mid * text.length * 0.56
    if (width <= availW && mid <= availH) {
      best = mid
      lo = mid
    } else {
      hi = mid
    }
  }
  const fontPx = Math.max(1, best)
  return { fontPx, cramped: fontPx < preferred * 0.72 }
}

/**
 * Draw the code on top of an existing opaque mask. Clip to the rectangle so
 * glyphs cannot cover the trace. The caller must already have erased the area.
 */
export function burnStudyLabel(
  ctx: LabelContext,
  pixelWidth: number,
  pixelHeight: number,
  rect: NormalizedRect,
  text: string,
  rotation: StudyRotation,
): { fontPx: number; cramped: boolean } | null {
  const code = cleanStudyCode(text)
  if (!code) return null
  const area = normalizedToPixels(rect, pixelWidth, pixelHeight)
  if (area.width < 2 || area.height < 2) return null
  const swapped = rotation === 90 || rotation === 270
  const boxW = swapped ? area.height : area.width
  const boxH = swapped ? area.width : area.height
  const fit = fitStudyFont(ctx, code, boxW, boxH)
  ctx.save()
  ctx.beginPath()
  ctx.rect(area.x, area.y, area.width, area.height)
  ctx.clip()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.translate(area.x + area.width / 2, area.y + area.height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.fillStyle = STUDY_LABEL_COLOR
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = studyFont(fit.fontPx)
  ctx.fillText(code, 0, 0)
  ctx.restore()
  return fit
}
