/** At least three digits, wider when the document itself needs it. */
export function pageFileName(pageNumber: number, pageCount: number): string {
  const safePage = Math.max(1, Math.floor(pageNumber))
  const width = Math.max(3, String(Math.max(1, Math.floor(pageCount))).length)
  return `ecg-${String(safePage).padStart(width, '0')}.pdf`
}

/** Safe stem from a PDF file name, used so batch output keeps the source identity. */
export function fileStem(originalName: string): string {
  const leaf = originalName.split(/[/\\]/).pop() ?? originalName
  const stripped = leaf.replace(/\.pdf$/i, '')
  const cleaned = stripped
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return cleaned || 'report'
}

export function pageOutputName(stem: string, pageNumber: number, pageCount: number): string {
  return `${fileStem(stem)}-${pageFileName(pageNumber, pageCount)}`
}

export type NamedSource = {
  stem: string
  names: string[]
  disambiguated: boolean
}

/**
 * One output name per page. Files that share a stem get -2, -3, … in input order
 * so two "report.pdf" files never write the same ZIP entry.
 */
export function planOutputNames(files: { name: string; pageCount: number }[]): NamedSource[] {
  const stems = files.map((file) => fileStem(file.name))
  const totals = new Map<string, number>()
  for (const stem of stems) totals.set(stem, (totals.get(stem) ?? 0) + 1)
  const seen = new Map<string, number>()
  const used = new Set<string>()
  return files.map((file, index) => {
    const stem = stems[index] ?? 'report'
    const occurrence = (seen.get(stem) ?? 0) + 1
    seen.set(stem, occurrence)
    const unique = (totals.get(stem) ?? 1) > 1 ? `${stem}-${occurrence}` : stem
    const names = Array.from({ length: Math.max(0, file.pageCount) }, (_, page) => {
      let name = pageOutputName(unique, page + 1, file.pageCount)
      let extra = 2
      while (used.has(name)) {
        name = pageOutputName(`${unique}-${extra}`, page + 1, file.pageCount)
        extra += 1
      }
      used.add(name)
      return name
    })
    return { stem: unique, names, disambiguated: (totals.get(stem) ?? 1) > 1 }
  })
}

export function batchZipName(fileNames: string[]): string {
  if (fileNames.length === 1) return zipFileName(fileNames[0] ?? 'report.pdf')
  return 'redactly-anonymized.zip'
}

export function zipFileName(originalName: string): string {
  const leaf = originalName.split(/[/\\]/).pop() ?? originalName
  const stripped = leaf.replace(/\.pdf$/i, '')
  const cleaned = stripped
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  const base = cleaned || 'report'
  return `${base}-anonymized.zip`
}
