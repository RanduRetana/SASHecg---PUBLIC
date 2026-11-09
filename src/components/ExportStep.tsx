import { Download } from '@/lib/icons'
import { formatBytes } from '@/core/format'
import { zipFileName } from '@/core/naming'
import type { Session } from '@/state/useSession'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Checkbox } from '@/components/ui/checkbox'

export function ExportStep({ session }: { session: Session }) {
  const doc = session.doc
  if (!doc) return null
  const ready = session.slots.filter((slot) => slot)
  const filename = zipFileName(doc.name)
  const bytes = ready.reduce((sum, slot) => sum + (slot?.pdfBytes.byteLength ?? 0), 0)

  return (
    <section className="grid max-w-2xl gap-4">
      <header className="grid gap-1">
        <h1 className="text-xl font-medium tracking-[-0.03em]">Download the ZIP</h1>
        <p className="text-[13.5px] leading-relaxed text-fg-2">
          One PDF per page, named from the source file: report-ecg-001.pdf. Each file is a flat image. Nothing under the
          mask can be recovered.
        </p>
      </header>

      <div className="grid gap-2 rounded-xl border border-line bg-raised p-4 shadow-[var(--shadow)]">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Download />
          {filename}
        </div>
        <p className="text-[13px] text-fg-2">
          {ready.length} of {doc.pageCount} pages · about {formatBytes(bytes)} before packaging
        </p>
        <ul className="grid gap-0.5 text-[12px] tabular-nums text-fg-3">
          {ready.slice(0, 3).map((slot) => (
            <li key={slot?.filename}>{slot?.filename}</li>
          ))}
          {ready.length > 4 && <li>…</li>}
          {ready.length > 3 && <li>{ready[ready.length - 1]?.filename}</li>}
        </ul>
      </div>

      {session.stale && (
        <Callout tone="warning" title="Generate the pages again">
          The areas or the study code changed after processing.
        </Callout>
      )}
      {session.failures.length > 0 && (
        <Callout tone="danger" title="Some pages failed">
          The ZIP is created only when the batch is complete.
        </Callout>
      )}
      {!session.stale && session.failures.length === 0 && ready.length !== doc.pageCount && (
        <Callout tone="warning" title="Not ready to export">
          Some pages still need processing.
        </Callout>
      )}
      {session.studyNeedsAck && (
        <Callout tone="warning" title="Study code is incomplete">
          {session.studyGaps.unassigned.length > 0
            ? 'The study code option is on, but the field is empty. Every page would be redacted with no code.'
            : `${session.studyGaps.missingArea.length === 1 ? '1 page does' : `${session.studyGaps.missingArea.length} pages do`} not have the chosen area, so the code will not be drawn there. The rectangles on those pages are still covered.`}
          {session.studyGaps.missingArea.length > 0 && (
            <span className="mt-1 block">
              {session.studyGaps.missingArea
                .slice(0, 6)
                .map((index) => pageLabel(doc, index))
                .join(', ')}
              {session.studyGaps.missingArea.length > 6 ? `, and ${session.studyGaps.missingArea.length - 6} more` : ''}
            </span>
          )}
          <Checkbox
            className="mt-2"
            checked={session.studyAcknowledged}
            onCheckedChange={(checked) => session.setStudyAcknowledged(checked === true)}
            label="Export anyway"
            description="I have checked the pages that will not show a study code."
          />
        </Callout>
      )}

      {session.exportError && (
        <Callout tone="danger" title="Download failed">
          {session.exportError}
        </Callout>
      )}

      {session.exportName && (
        <Callout tone="success" title="Done">
          {session.exportName} is in this browser’s downloads. This tab still holds its working copy until you reload it or
          choose New file.
        </Callout>
      )}

      <Callout tone="info" title="Privacy">
        The ZIP is built in this browser. SASHecg does not upload it. The downloaded file stays in your downloads
        folder. Reloading this tab drops the copy held here, including the password. Page names still include the
        source file name.
      </Callout>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-page/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button
          type="button"
          variant="primary"
          className="w-full sm:w-auto"
          disabled={!session.readyToExport || session.exporting}
          loading={session.exporting}
          loadingText="Preparing the ZIP…"
          onClick={() => void session.exportZip()}
        >
          Download ZIP
        </Button>
      </div>
    </section>
  )
}

function pageLabel(doc: NonNullable<Session['doc']>, index: number) {
  const page = doc.pages[index]
  if (!page) return `Page ${index + 1}`
  return doc.fileCount > 1 ? `Page ${page.index + 1} · ${page.sourceName}` : `Page ${page.index + 1}`
}
