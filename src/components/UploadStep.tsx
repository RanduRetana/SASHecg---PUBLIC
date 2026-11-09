import { File as FileIcon, Lock } from '@/lib/icons'
import { formatBytes, formatMillimeters } from '@/core/format'
import type { Session } from '@/state/useSession'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Dropzone } from '@/components/ui/dropzone'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

const REJECTION: Record<string, string> = {
  type: 'Only PDF files are accepted.',
  size: 'The file is over this browser’s 512 MB limit.',
  empty: 'The file is empty.',
  count: 'Up to 1000 PDFs at a time.',
}

export function UploadStep({ session }: { session: Session }) {
  const first = session.doc?.pages[0]

  return (
    <section className="grid gap-4">
      <header className="grid gap-1">
        <h1 className="text-xl font-medium tracking-[-0.03em]">Upload a report</h1>
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-fg-2">
          Upload one multi-page PDF or many PDFs, set the redaction area once, review the pages, and download a ZIP of
          individual anonymized PDFs.
        </p>
      </header>

      <Dropzone
        accept={['application/pdf', '.pdf']}
        multiple
        maxFiles={1000}
        maxSize={512 * 1024 * 1024}
        disabled={session.loading}
        paste="focus"
        label="Choose PDFs"
        title="Drop PDFs here"
        hint="One report or many files. Read only on this device."
        onFilesAccepted={(files) => {
          if (files.length) void session.loadFiles(files)
        }}
        onFilesRejected={(rejections) => {
          const reason = rejections[0]?.reason ?? 'type'
          session.reportFileError(REJECTION[reason] ?? 'That file could not be used.')
        }}
      />

      {session.loading && (
        <div className="flex items-center gap-2 text-[13px] text-fg-2">
          <Spinner size="sm" label="Opening PDFs" />
          {session.loadProgress
            ? `Reading ${session.loadProgress.done + 1} of ${session.loadProgress.total} · ${session.loadProgress.name}`
            : 'Opening PDFs…'}
        </div>
      )}

      {session.fileError && (
        <Callout tone="danger" title="Could not open">
          {session.fileError}
        </Callout>
      )}

      {session.passwordNeeded && (
        <form
          className="grid max-w-md gap-3 rounded-xl border border-line bg-raised p-4 shadow-[var(--shadow)]"
          onSubmit={(event) => {
            event.preventDefault()
            void session.submitPassword()
          }}
        >
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <Lock />
            {session.passwordFor ? `Password for ${session.passwordFor}` : 'PDF password'}
          </div>
          <Input
            type="password"
            autoComplete="off"
            value={session.password}
            onValueChange={session.setPassword}
            placeholder="Stays in this browser"
            aria-label="PDF password"
            invalid={Boolean(session.passwordError)}
          />
          <p className="text-[12px] leading-relaxed text-fg-3">
            Used once to decrypt the file here. It is not saved and it is not sent anywhere.
          </p>
          {session.passwordError && <p className="text-[12px] text-danger">{session.passwordError}</p>}
          <Button type="submit" variant="primary" loading={session.loading} loadingText="Checking…">
            Open
          </Button>
        </form>
      )}

      {session.doc && first && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised px-4 py-3 shadow-[var(--shadow)]">
          <div className="flex min-w-0 items-center gap-3">
            <FileIcon />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{session.doc.name}</p>
              <p className="text-[12px] text-fg-3">
                {session.doc.fileCount} {session.doc.fileCount === 1 ? 'file' : 'files'} · {session.doc.pageCount}{' '}
                {session.doc.pageCount === 1 ? 'page' : 'pages'} · {formatBytes(session.doc.size)}
                {session.doc.fileCount === 1 ? ` · ${formatMillimeters(first.widthPt, first.heightPt)}` : ''}
                {session.doc.mixed ? ' · mixed sizes' : ''}
                {session.doc.disambiguated ? ' · duplicate names made unique' : ''}
              </p>
            </div>
          </div>
          <Button type="button" variant="primary" onClick={() => session.goTo(1)}>
            Define area
          </Button>
        </div>
      )}

      {session.doc && session.doc.skipped.length > 0 && (
        <Callout tone="warning" title="Some files were skipped">
          {session.doc.skipped
            .slice(0, 4)
            .map((file) => `${file.name}: ${file.message}`)
            .join(' ')}
          {session.doc.skipped.length > 4 ? ` ${session.doc.skipped.length - 4} more.` : ''}
        </Callout>
      )}

      <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-[var(--lilac-deep)] bg-[var(--blush)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-[12.5px] leading-relaxed text-fg-2">
          Want to practice with a real report? The file is four synthetic pages in that layout, each with a different
          invented patient and no redaction bars.
        </p>
        <Button type="button" variant="secondary" loading={session.loading} onClick={() => void session.loadSample()}>
          Create practice report
        </Button>
      </div>
    </section>
  )
}
