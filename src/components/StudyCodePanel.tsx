import type { Session } from '@/state/useSession'
import { STUDY_ROTATIONS, type StudyRotation } from '@/core/studyCode'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldControl, FieldDescription, FieldLabel } from '@/components/ui/field'
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control'

export function StudyCodePanel({ session }: { session: Session }) {
  const doc = session.doc
  if (!doc) return null
  const targetHere = session.activeRects.some((rect) => rect.id === session.studyTargetId)

  return (
    <section className="grid gap-3 border-t border-line pt-3" aria-labelledby="study-code-heading">
      <div className="grid gap-1">
        <h2 id="study-code-heading" className="text-[13px] font-medium text-fg">
          Study code
        </h2>
        <p className="text-[12px] leading-relaxed text-fg-3">
          Optional. Leave it off and the pages are only redacted.
        </p>
      </div>
      <Checkbox
        label="Add one study code"
        description="The same code is burned onto every page of every PDF in this batch."
        checked={session.studyEnabled}
        onCheckedChange={(checked) => session.setStudyEnabled(checked === true)}
      />
      {session.studyEnabled && (
        <div className="grid gap-3">
          <Field size="sm">
            <FieldLabel>Code</FieldLabel>
            <FieldControl
              value={session.studyCode}
              maxLength={64}
              placeholder="8805-001"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => session.setStudyCode(event.currentTarget.value)}
            />
            <FieldDescription>
              Type it yourself. A new upload clears this field and does not fill in the next number. Leading zeros stay
              as typed. Do not enter a name or record number.
            </FieldDescription>
          </Field>

          <div className="grid gap-1">
            <p className="text-[12px] font-medium text-fg">Put the code in</p>
            <div role="radiogroup" aria-label="Area that receives the study code" className="grid gap-1">
              {session.activeRects.map((area, index) => {
                const id = area.id
                if (!id) return null
                const selected = id === session.studyTargetId
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-[12px] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-fg-3 ${selected ? 'border-[var(--accent)] bg-[var(--blush)] text-fg' : 'border-line bg-raised text-fg-2'}`}
                    onClick={() => session.setStudyTargetId(id)}
                  >
                    <span className="font-medium">Area {index + 1}</span>
                    <span className="tabular-nums">
                      {area.x.toFixed(2)}, {area.y.toFixed(2)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-1">
            <p id="study-orientation" className="text-[12px] font-medium text-fg">
              Orientation
            </p>
            <SegmentedControl
              value={String(session.studyRotation)}
              onValueChange={(value) => session.setStudyRotation(Number(value) as StudyRotation)}
              aria-labelledby="study-orientation"
              fill
            >
              {STUDY_ROTATIONS.map((rotation) => (
                <SegmentedControlItem key={rotation} value={String(rotation)}>
                  {rotation}°
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
            <p className="text-[12px] leading-relaxed text-fg-3">Clockwise. The dark preview matches the burned file.</p>
          </div>

          {!session.studyCode.trim() && (
            <Callout tone="warning" size="sm" title="No code yet">
              The option is on, but the field is empty. Every page would be redacted with no code.
            </Callout>
          )}
          {session.studyCode.trim() && !targetHere && (
            <Callout tone="warning" size="sm" title="Chosen area is not on this page">
              This page keeps its own areas, and they do not include the rectangle selected for the code. The code is
              not drawn here. The areas that are here are still covered. Pick an area on this page, or remove the
              exception.
            </Callout>
          )}
          {session.studyMissingCount > 0 && targetHere && (
            <Callout tone="note" size="sm" title="Some pages lack this area">
              {session.studyMissingCount === 1
                ? '1 page does not have the chosen area, so it will not show the code.'
                : `${session.studyMissingCount} pages do not have the chosen area, so they will not show the code.`}{' '}
              Their other rectangles are still covered.
            </Callout>
          )}
          <Button type="button" variant="ghost" onClick={() => session.setStudyEnabled(false)}>
            Turn study code off
          </Button>
        </div>
      )}
    </section>
  )
}
