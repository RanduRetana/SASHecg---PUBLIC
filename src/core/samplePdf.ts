import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'

export type PracticeCase = {
  name: string
  id: string
  visit: string
  room: string
  order: string
  provider: string
  referrer: string
  device: string
  phone: string
  email: string
  hr: string
  rr: string
  p: string
  pr: string
  qrs: string
  qt: string
  qtc: string
  pAxis: string
  qrsAxis: string
  tAxis: string
  diagnosis: string[]
  banner: string
  rrMs: number
  irregular: boolean
  noP: boolean
  rbbb: boolean
  gain: number
}

/** Invented identities. The default upper-left rectangle is meant to cover each block. */
export const PRACTICE_CASES: PracticeCase[] = [
  {
    name: 'AVERY QUILL',
    id: 'FIC-00421',
    visit: 'V-2026-1184',
    room: '4B',
    order: 'ORD-88021',
    provider: 'Dr. N. Hale',
    referrer: 'Dr. L. Moss',
    device: 'Harbor Trace HT-10',
    phone: '555-0148',
    email: 'a.quill@example.test',
    hr: '57 bpm',
    rr: '1057 ms',
    p: '96 ms',
    pr: '127 ms',
    qrs: '105 ms',
    qt: '451 ms',
    qtc: '439 ms',
    pAxis: '70°',
    qrsAxis: '75°',
    tAxis: '59°',
    diagnosis: ['Sinus rhythm', 'Normal electrical axis', 'Incomplete right bundle branch block', 'Otherwise normal ECG', 'Unconfirmed report'],
    banner: 'Otherwise normal',
    rrMs: 1057,
    irregular: false,
    noP: false,
    rbbb: true,
    gain: 1,
  },
  {
    name: 'JORDAN PELL',
    id: 'FIC-11880',
    visit: 'V-2026-2044',
    room: '12A',
    order: 'ORD-44109',
    provider: 'Dr. P. Okonkwo',
    referrer: 'Dr. S. Ito',
    device: 'Harbor Trace HT-22',
    phone: '555-0192',
    email: 'j.pell@example.test',
    hr: '88 bpm',
    rr: '682 ms',
    p: '84 ms',
    pr: '148 ms',
    qrs: '86 ms',
    qt: '372 ms',
    qtc: '408 ms',
    pAxis: '52°',
    qrsAxis: '41°',
    tAxis: '38°',
    diagnosis: ['Sinus rhythm', 'Normal electrical axis', 'Normal ECG', 'No prior tracing for comparison', 'Unconfirmed report'],
    banner: 'Normal tracing',
    rrMs: 682,
    irregular: false,
    noP: false,
    rbbb: false,
    gain: 0.92,
  },
  {
    name: 'MIRA SOLEN',
    id: 'FIC-33017',
    visit: 'V-2026-0771',
    room: 'ICU-2',
    order: 'ORD-22954',
    provider: 'Dr. H. Berg',
    referrer: 'Dr. A. Nguyen',
    device: 'Harbor Trace HT-07',
    phone: '555-0166',
    email: 'm.solen@example.test',
    hr: '49 bpm',
    rr: '1224 ms',
    p: '108 ms',
    pr: '186 ms',
    qrs: '92 ms',
    qt: '468 ms',
    qtc: '422 ms',
    pAxis: '28°',
    qrsAxis: '12°',
    tAxis: '4°',
    diagnosis: ['Sinus bradycardia', 'Horizontal axis', 'Nonspecific ST-T change', 'Otherwise unremarkable', 'Unconfirmed report'],
    banner: 'Sinus bradycardia',
    rrMs: 1224,
    irregular: false,
    noP: false,
    rbbb: false,
    gain: 1.05,
  },
  {
    name: 'CASEY HOLM',
    id: 'FIC-90255',
    visit: 'V-2026-5510',
    room: 'ED-6',
    order: 'ORD-77340',
    provider: 'Dr. R. Adel',
    referrer: 'Dr. K. Petrov',
    device: 'Harbor Trace HT-41',
    phone: '555-0133',
    email: 'c.holm@example.test',
    hr: '96 bpm',
    rr: '625 ms',
    p: 'n/a',
    pr: 'n/a',
    qrs: '88 ms',
    qt: '348 ms',
    qtc: '414 ms',
    pAxis: 'n/a',
    qrsAxis: '68°',
    tAxis: '44°',
    diagnosis: ['Atrial fibrillation', 'Moderate ventricular response', 'Nonspecific ST-T change', 'No acute injury pattern', 'Unconfirmed report'],
    banner: 'Irregular rhythm',
    rrMs: 625,
    irregular: true,
    noP: true,
    rbbb: false,
    gain: 0.88,
  },
]

export const PRACTICE_PATIENT = PRACTICE_CASES[0]?.name ?? 'AVERY QUILL'
export const PRACTICE_ID = PRACTICE_CASES[0]?.id ?? 'FIC-00421'

const PAGE_W = 792
const PAGE_H = 612
const INK = rgb(0.1, 0.1, 0.12)
const MUTED = rgb(0.28, 0.28, 0.3)
const GRID = rgb(1, 0.8, 0.82)
const GRID_BOLD = rgb(0.86, 0.45, 0.5)
const MM = 72 / 25.4
const MV = 10 * MM
const MS = (25 / 1000) * MM

type Shape = { p: number; q: number; r: number; s: number; rp: number; t: number }

const SHAPES: Record<string, Shape> = {
  I: { p: 0.12, q: -0.08, r: 0.85, s: -0.22, rp: 0, t: 0.22 },
  II: { p: 0.18, q: -0.04, r: 1.2, s: -0.18, rp: 0, t: 0.34 },
  III: { p: 0.08, q: 0.02, r: 0.42, s: -0.28, rp: 0, t: 0.1 },
  aVR: { p: -0.14, q: 0.06, r: -0.95, s: 0.12, rp: 0, t: -0.22 },
  aVL: { p: 0.07, q: -0.1, r: 0.38, s: -0.12, rp: 0, t: 0.08 },
  aVF: { p: 0.15, q: -0.02, r: 0.9, s: -0.2, rp: 0, t: 0.28 },
  V1: { p: 0.05, q: 0, r: 0.22, s: -0.85, rp: 0.48, t: -0.18 },
  V2: { p: 0.07, q: 0, r: 0.48, s: -1.15, rp: 0.12, t: 0.22 },
  V3: { p: 0.1, q: -0.02, r: 0.95, s: -0.45, rp: 0, t: 0.38 },
  V4: { p: 0.12, q: -0.04, r: 1.35, s: -0.22, rp: 0, t: 0.42 },
  V5: { p: 0.12, q: -0.05, r: 1.15, s: -0.18, rp: 0, t: 0.34 },
  V6: { p: 0.1, q: -0.06, r: 0.82, s: -0.32, rp: 0, t: 0.24 },
}

const COLUMNS = [
  ['I', 'II', 'III'],
  ['aVR', 'aVL', 'aVF'],
  ['V1', 'V2', 'V3'],
  ['V4', 'V5', 'V6'],
] as const

/** Four landscape practice pages in a familiar 12-lead layout. No redaction bars. */
export async function createSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Synthetic practice report')
  doc.setAuthor('Redactly')
  doc.setSubject('Invented data for redaction practice')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  PRACTICE_CASES.forEach((practice, index) => {
    const page = doc.addPage([PAGE_W, PAGE_H])
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(1, 1, 1) })
    drawGrid(page, 24, 40, PAGE_W - 24, 508)
    drawHeader(page, font, bold, practice)
    drawLeads(page, font, practice)
    drawFooter(page, font, index + 1, PRACTICE_CASES.length)
  })

  return new Uint8Array(await doc.save())
}

function drawHeader(page: PDFPage, font: PDFFont, bold: PDFFont, practice: PracticeCase) {
  const left = [
    practice.name,
    `ID ${practice.id}`,
    `Visit ID  ${practice.visit}`,
    `Room  ${practice.room}`,
    `Order ID  ${practice.order}`,
    `Provider  ${practice.provider}`,
    `Ref. phys.  ${practice.referrer}`,
    `Device  ${practice.device}`,
    `Phone  ${practice.phone}`,
    `Email  ${practice.email}`,
  ]
  left.forEach((line, index) => {
    page.drawText(line, {
      x: 16,
      y: 596 - index * 8.2,
      size: index === 0 ? 8 : 6.5,
      font: index === 0 ? bold : font,
      color: INK,
    })
  })

  const measures: [string, string][] = [
    ['HR', practice.hr],
    ['RR', practice.rr],
    ['P', practice.p],
    ['PR', practice.pr],
    ['QRS', practice.qrs],
    ['QT', practice.qt],
    ['QTcB', practice.qtc],
  ]
  measures.forEach(([label, value], index) => {
    const y = 590 - index * 9
    page.drawText(label, { x: 268, y, size: 7, font, color: MUTED })
    page.drawText(value, { x: 300, y, size: 7.5, font: label === 'HR' ? bold : font, color: INK })
  })
  const axes: [string, string][] = [
    ['P axis', practice.pAxis],
    ['QRS axis', practice.qrsAxis],
    ['T axis', practice.tAxis],
  ]
  axes.forEach(([label, value], index) => {
    const y = 572 - index * 11
    page.drawText(label, { x: 390, y, size: 7, font, color: MUTED })
    page.drawText(value, { x: 438, y, size: 7.5, font: bold, color: INK })
  })

  practice.diagnosis.forEach((line, index) => {
    page.drawText(line, {
      x: 520,
      y: 590 - index * 11,
      size: 7.5,
      font: index === 0 ? bold : font,
      color: INK,
    })
  })

  page.drawText('HARBOR TRACE', { x: 680, y: 592, size: 8, font: bold, color: INK })
  page.drawText(`${practice.device.replace('Harbor Trace ', '')} practice unit`, { x: 680, y: 582, size: 6, font, color: MUTED })
}

function drawLeads(page: PDFPage, font: PDFFont, practice: PracticeCase) {
  page.drawText(practice.banner, {
    x: 330,
    y: 512,
    size: 8,
    font,
    color: INK,
  })

  const baselines = [452, 348, 244]
  COLUMNS.forEach((column, columnIndex) => {
    const x = 36 + columnIndex * 186
    column.forEach((lead, row) => {
      const baseline = baselines[row] ?? 244
      page.drawText(lead, { x, y: baseline + 34, size: 7, font, color: INK })
      drawTrace(page, x, baseline, 2500, shapeFor(lead, practice), columnIndex * 2500, practice)
    })
  })

  page.drawText('Sequential', { x: 368, y: 176, size: 8, font, color: INK })
  page.drawText('II', { x: 36, y: 150, size: 7, font, color: INK })
  drawTrace(page, 36, 104, 10200, shapeFor('II', practice), 0, practice)
}

function drawFooter(page: PDFPage, font: PDFFont, pageNumber: number, pageCount: number) {
  page.drawText('25 mm/s, 10 mm/mV', { x: 28, y: 22, size: 7, font, color: INK })
  page.drawText('Synthetic practice report', { x: 318, y: 22, size: 7, font, color: MUTED })
  page.drawText('LP 40Hz, AC 50Hz', { x: 560, y: 22, size: 7, font, color: INK })
  page.drawText(`Page ${pageNumber} of ${pageCount}`, { x: 690, y: 22, size: 7, font, color: INK })
}

function drawGrid(page: PDFPage, x0: number, y0: number, x1: number, y1: number) {
  const step = MM
  let index = 0
  for (let x = x0; x <= x1; x += step) {
    const major = index % 5 === 0
    page.drawLine({
      start: { x, y: y0 },
      end: { x, y: y1 },
      thickness: major ? 0.6 : 0.22,
      color: major ? GRID_BOLD : GRID,
    })
    index += 1
  }
  index = 0
  for (let y = y0; y <= y1; y += step) {
    const major = index % 5 === 0
    page.drawLine({
      start: { x: x0, y },
      end: { x: x1, y },
      thickness: major ? 0.6 : 0.22,
      color: major ? GRID_BOLD : GRID,
    })
    index += 1
  }
}

function shapeFor(lead: string, practice: PracticeCase): Shape {
  const base = SHAPES[lead] ?? SHAPES.II
  return {
    p: practice.noP ? 0 : base.p * practice.gain,
    q: base.q * practice.gain,
    r: base.r * practice.gain,
    s: base.s * practice.gain,
    rp: practice.rbbb ? base.rp * practice.gain : 0,
    t: base.t * practice.gain,
  }
}

function drawTrace(
  page: PDFPage,
  originX: number,
  baseline: number,
  durationMs: number,
  shape: Shape,
  timeOffset: number,
  practice: PracticeCase,
) {
  const stepMs = 4
  const samples: number[] = []
  for (let t = 0; t <= durationMs; t += stepMs) {
    const cal = calibrationMv(t)
    const mv = cal === null ? sampleMv(timeOffset + Math.max(0, t - 200), shape, practice) : cal
    samples.push(mv * MV)
  }
  const dx = stepMs * MS
  let path = `M 0 ${(-samples[0]).toFixed(2)}`
  for (let index = 1; index < samples.length; index++) {
    path += ` L ${(index * dx).toFixed(2)} ${(-samples[index]).toFixed(2)}`
  }
  page.drawSvgPath(path, {
    x: originX,
    y: baseline,
    borderColor: INK,
    borderWidth: 0.7,
  })
}

function calibrationMv(tMs: number): number | null {
  if (tMs >= 200) return null
  if (tMs < 40 || tMs > 160) return 0
  return 1
}

function sampleMv(tMs: number, shape: Shape, practice: PracticeCase): number {
  const phase = phaseInBeat(tMs, practice)
  const width = practice.rbbb ? 1.12 : 1
  const bump = (center: number, sigma: number, gain: number) =>
    gain * Math.exp(-((phase - center) ** 2) / (2 * (sigma * width) ** 2))
  const wander = 0.012 * Math.sin(tMs / 740)
  const grain = ((Math.sin(tMs * 0.37) * 1000) % 1 - 0.5) * 0.01
  return (
    bump(70, 16, shape.p) +
    bump(198, 6, shape.q) +
    bump(220, 7, shape.r) +
    bump(246, 9, shape.s) +
    bump(278, 11, shape.rp) +
    bump(560, 48, shape.t) +
    wander +
    grain
  )
}

function phaseInBeat(tMs: number, practice: PracticeCase): number {
  if (!practice.irregular) return ((tMs % practice.rrMs) + practice.rrMs) % practice.rrMs
  let cursor = 0
  for (let beat = 0; beat < 80; beat++) {
    const interval = practice.rrMs * (0.7 + 0.55 * (0.5 + 0.5 * Math.sin(beat * 1.7)))
    if (cursor + interval > tMs) return tMs - cursor
    cursor += interval
  }
  return 0
}
