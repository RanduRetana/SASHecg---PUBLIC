import { formatDpi, formatMillimeters } from '@/core/format'
import type { Session } from '@/state/useSession'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Checkbox } from '@/components/ui/checkbox'
import { ProgressBar } from '@/components/ui/progress-bar'
import { ScrollArea } from '@/components/ui/scroll-area'

export function ReviewStep({ session }: { session: Session }) {
  const doc = session.doc
  if (!doc) return null
  const current = session.slots[session.active]
  const selected = [...session.selection].sort((a, b) => a - b)

  return (
    <section className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-xl font-medium tracking-[-0.03em]">Review every page</h1>
          <p className="max-w-2xl text-[13.5px] leading-relaxed text-fg-2">
            The thumbnails are already anonymized. If a page places the block somewhere else, select it and set an
            exception.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => session.setSelection(doc.pages.map((page) => page.index))}>
            All
          </Button>
          <Button type="button" variant="ghost" onClick={() => session.setSelection([])}>
            None
          </Button>
        </div>
      </header>

      {session.processing && session.progress && (
        <div className="grid gap-2">
          <ProgressBar
            value={session.progress.total ? (session.progress.done / session.progress.total) * 100 : 0}
            label="Processing in this browser"
            description={`${session.progress.done} of ${session.progress.total}${session.progress.label ? ` · ${session.progress.label}` : ''}`}
          />
          <Button type="button" variant="danger" onClick={() => session.cancel()}>
            Cancel
          </Button>
        </div>
      )}

      {session.cancelled && !session.readyToExport && (
        <Callout
          tone="warning"
          title="Processing stopped"
          action={
            <Button type="button" variant="secondary" disabled={session.processing} onClick={() => void session.process()}>
              Resume all
            </Button>
          }
        >
          Some pages are missing. The ZIP is created only when the batch is complete.
        </Callout>
      )}

      {session.stale && (
        <Callout
          tone="warning"
          title="The area changed"
          action={
            <Button type="button" variant="secondary" disabled={session.processing} onClick={() => void session.process()}>
              Reprocess all
            </Button>
          }
        >
          The thumbnails no longer match the current areas.
        </Callout>
      )}

      {session.failures.length > 0 && (
        <Callout
          tone="danger"
          title={`${session.failures.length} ${session.failures.length === 1 ? 'page failed' : 'pages failed'}`}
          action={
            <Button
              type="button"
              variant="danger"
              disabled={session.processing}
              onClick={() => void session.process(session.failures.map((failure) => failure.index))}
            >
              Retry
            </Button>
          }
        >
          {session.failures
            .slice(0, 4)
            .map((failure) => `Page ${failure.index + 1}: ${failure.message}`)
            .join(' ')}
        </Callout>
      )}

      {session.warnings.length > 0 && (
        <Callout tone="note" size="sm" title="Resolution reduced">
          {session.warnings[0]}
        </Callout>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ScrollArea className="h-[min(70vh,820px)] rounded-xl border border-line bg-frame" aria-label="Anonymized pages">
          <ul className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 xl:grid-cols-4">
            {doc.pages.map((info) => {
              const slot = session.slots[info.index]
              const isActive = session.active === info.index
              const isSelected = session.selection.includes(info.index)
              return (
                <li key={info.index}>
                  <article
                    className={`rounded-lg border bg-raised p-1.5 ${isActive ? 'border-[var(--accent)]' : 'border-line'} ${isSelected ? 'ring-2 ring-[var(--accent)]/45' : ''}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-1 px-0.5">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => session.toggleSelected(info.index, false)}
                        aria-label={`Select page ${info.index + 1}`}
                      />
                      <span className="text-[12px] tabular-nums text-fg-2">{info.index + 1}</span>
                    </div>
                    <button
                      type="button"
                      className="block w-full rounded-md outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-fg-3"
                      aria-pressed={isActive}
                      aria-label={`View page ${info.index + 1}`}
                      onClick={(event) => {
                        if (event.shiftKey) session.toggleSelected(info.index, true)
                        else session.setActive(info.index)
                      }}
                    >
                      {slot ? (
                        <img
                          src={slot.previewUrl}
                          alt=""
                          className="aspect-[3/4] w-full rounded bg-white object-contain object-top"
                        />
                      ) : (
                        <span className="grid aspect-[3/4] place-items-center rounded bg-page px-2 text-center text-[12px] text-fg-3">
                          Not processed
                        </span>
                      )}
                    </button>
                    <div className="mt-1 flex items-center justify-between gap-1 px-0.5">
                      <span className="truncate text-[10.5px] text-fg-3">{slot?.filename ?? info.outputName}</span>
                      {slot?.exception ? (
                        <Badge tone="warning" size="sm">
                          Exception
                        </Badge>
                      ) : null}
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        </ScrollArea>

        <aside className="grid gap-3 rounded-xl border border-line bg-raised p-4 shadow-[var(--shadow)] lg:sticky lg:top-4">
          <h2 className="text-[14px] font-medium">Page {session.active + 1}</h2>
          {current ? (
            <>
              <img src={current.previewUrl} alt={`Anonymized page ${session.active + 1}`} className="w-full rounded-md bg-white" />
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                <dt className="text-fg-3">File</dt>
                <dd className="text-right tabular-nums">{current.filename}</dd>
                <dt className="text-fg-3">Size</dt>
                <dd className="text-right">{formatMillimeters(current.widthPt, current.heightPt)}</dd>
                <dt className="text-fg-3">Resolution</dt>
                <dd className="text-right">{formatDpi(current.dpi)}</dd>
                <dt className="text-fg-3">Areas</dt>
                <dd className="text-right tabular-nums">{current.rects.length}</dd>
                <dt className="text-fg-3">Study code</dt>
                <dd className="text-right">{current.studyCode ?? 'None'}</dd>
                {current.rects.map((rect, index) => (
                  <span key={index} className="contents">
                    <dt className="text-fg-3">Area {index + 1}</dt>
                    <dd className="text-right tabular-nums">
                      {rect.x.toFixed(3)}, {rect.y.toFixed(3)}
                    </dd>
                  </span>
                ))}
              </dl>
              {current.exception ? <Badge tone="warning">Exception</Badge> : <Badge tone="info">Shared areas</Badge>}
            </>
          ) : (
            <p className="text-[13px] leading-relaxed text-fg-2">This page does not have an anonymized image yet.</p>
          )}

          <div className="grid gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={selected.length === 0}
              onClick={() => session.editPages(selected.length ? selected : [session.active])}
            >
              Adjust selection
            </Button>
            <Button type="button" variant="secondary" onClick={() => session.editPages([session.active])}>
              Adjust this page
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!session.overrides[session.active] && selected.every((index) => !session.overrides[index])}
              onClick={() => session.clearExceptions(selected.length ? selected : [session.active])}
            >
              Remove exception
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={session.processing}
              disabled={session.processing}
              onClick={() => void session.process(selected.length ? selected : [session.active])}
            >
              Reprocess
            </Button>
          </div>
          <p className="text-[11.5px] leading-relaxed text-fg-3">Shift-click a thumbnail to select a range.</p>
        </aside>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-page/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="button" variant="primary" className="w-full sm:w-auto" disabled={!session.readyToExport} onClick={() => session.goTo(3)}>
          Continue to export
        </Button>
      </div>
    </section>
  )
}
