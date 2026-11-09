import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

type Phase = 'alive' | 'zap' | 'stew'

export function FishyStew({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>('alive')
  const timer = useRef<number | null>(null)
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const revealed = phase !== 'alive'

  function kiss() {
    if (phase !== 'alive') return
    if (reduce) {
      setPhase('stew')
      return
    }
    setPhase('zap')
    timer.current = window.setTimeout(() => setPhase('stew'), 420)
  }

  function retry() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setPhase('alive')
  }

  return (
    <main className="fishy-page mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-4 py-8 text-center text-fg">
      <p className="text-[12px] font-medium tracking-[0.14em] text-[var(--accent)] uppercase">SASHecg</p>
      <h1 className="text-2xl font-medium tracking-[-0.03em]">{phase === 'stew' ? 'Fish stew' : 'Fishy'}</h1>
      <div className="relative grid place-items-center">
        <img
          src={phase === 'stew' ? '/fishy/stew.gif' : '/fishy/fishy.gif'}
          alt={phase === 'stew' ? 'A bowl of cartoon fish stew with steam' : 'A smiling lavender fish swimming'}
          width={160}
          height={112}
          className="h-auto w-56 max-w-full rounded-2xl border border-[var(--lilac-deep)] bg-[var(--blush)] shadow-[var(--shadow)]"
        />
        {phase === 'zap' && (
          <div className="fishy-flash" aria-hidden>
            <svg viewBox="0 0 80 120" className="h-40 w-24">
              <path d="M40 4 L28 46 H44 L22 116 L58 52 H40 L54 4 Z" />
            </svg>
          </div>
        )}
      </div>
      {phase === 'stew' ? (
        <p className="max-w-sm text-[15px] leading-relaxed">Sorry, it was a typo. You just killed fishy :(</p>
      ) : (
        <p className="max-w-sm text-[13px] leading-relaxed text-fg-2">One very confident fish. No clinical use whatsoever.</p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="primary"
          onClick={kiss}
          aria-disabled={revealed || undefined}
          aria-label={revealed ? 'Kiss, struck through. Kill fishy' : 'Kiss fishy'}
        >
          {revealed ? (
            <>
              <span className="line-through decoration-2 opacity-80">Kiss</span> <span className="font-semibold">Kill</span> fishy
            </>
          ) : (
            'Kiss fishy'
          )}
        </Button>
        {phase === 'stew' && (
          <Button type="button" variant="secondary" onClick={retry}>
            Try again
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
      <style>{`
        .fishy-page { background: radial-gradient(520px 280px at 50% 0%, #f6b2ff 0%, transparent 70%), var(--page); }
        .fishy-flash {
          position: absolute;
          inset: -12%;
          display: grid;
          place-items: center;
          border-radius: 1.5rem;
          background: radial-gradient(circle, #ffffff 0%, #ffc6fe 42%, transparent 72%);
          animation: fishy-zap 420ms linear forwards;
          pointer-events: none;
        }
        .fishy-flash path { fill: #4c356f; }
        @keyframes fishy-zap {
          0% { opacity: 0; transform: scale(0.9); }
          20% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.05); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fishy-flash { animation: none; opacity: 0; }
          .line-through { text-decoration-thickness: 2px; }
        }
      `}</style>
    </main>
  )
}
