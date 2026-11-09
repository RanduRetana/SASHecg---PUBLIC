import {
  getDocument,
  InvalidPDFException,
  PasswordException,
  PasswordResponses,
  type PDFDocumentProxy,
} from 'pdfjs-dist'

export type PageInfo = {
  index: number
  widthPt: number
  heightPt: number
  rotation: number
}

export type OpenedPdf = {
  pdf: PDFDocumentProxy
  destroy: () => Promise<void>
}

export class PdfOpenError extends Error {
  readonly kind: 'password' | 'invalid-password' | 'invalid' | 'empty'

  constructor(kind: PdfOpenError['kind'], message: string) {
    super(message)
    this.name = 'PdfOpenError'
    this.kind = kind
  }
}

export async function openPdf(data: Uint8Array, password?: string): Promise<OpenedPdf> {
  if (data.byteLength === 0) {
    throw new PdfOpenError('empty', 'The file is empty.')
  }

  const task = getDocument({
    data: data.slice(),
    ...(password ? { password } : {}),
    verbosity: 0,
  })

  try {
    const pdf = await task.promise
    return {
      pdf,
      destroy: async () => {
        await pdf.cleanup()
        await task.destroy()
      },
    }
  } catch (error) {
    await task.destroy().catch(() => undefined)
    throw toPdfOpenError(error)
  }
}

export async function readPageInfos(pdf: PDFDocumentProxy): Promise<PageInfo[]> {
  const pages: PageInfo[] = []
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number)
    const viewport = page.getViewport({ scale: 1 })
    pages.push({
      index: number - 1,
      widthPt: viewport.width,
      heightPt: viewport.height,
      rotation: page.rotate,
    })
    page.cleanup()
  }
  return pages
}

export function pagesDiffer(pages: PageInfo[]): boolean {
  const first = pages[0]
  if (!first || pages.length < 2) return false
  return pages.some(
    (page) =>
      Math.abs(page.widthPt - first.widthPt) > 0.5 ||
      Math.abs(page.heightPt - first.heightPt) > 0.5 ||
      page.rotation !== first.rotation,
  )
}

export async function extractText(pdf: PDFDocumentProxy, pageNumber = 1): Promise<string> {
  const page = await pdf.getPage(pageNumber)
  const content = await page.getTextContent()
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
  page.cleanup()
  return text
}

function toPdfOpenError(error: unknown): PdfOpenError {
  if (error instanceof PdfOpenError) return error
  const name = error instanceof Error ? error.name : ''
  const code =
    typeof error === 'object' && error && 'code' in error ? Number((error as { code: unknown }).code) : Number.NaN
  if (error instanceof PasswordException || name === 'PasswordException') {
    if (code === PasswordResponses.INCORRECT_PASSWORD) {
      return new PdfOpenError(
        'invalid-password',
        'That password does not open this PDF. It stays in this browser and is not saved.',
      )
    }
    return new PdfOpenError(
      'password',
      'This PDF is protected. The password is used only in this browser and is not saved.',
    )
  }
  if (error instanceof InvalidPDFException || name === 'InvalidPDFException' || name === 'UnknownErrorException') {
    return new PdfOpenError('invalid', 'Could not read the PDF. It may be damaged or not a PDF.')
  }
  return new PdfOpenError('invalid', 'Could not open the document.')
}
