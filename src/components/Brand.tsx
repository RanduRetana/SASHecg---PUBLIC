export function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--lilac-deep)] bg-[var(--blush)] text-[var(--accent)] shadow-[var(--shadow)]">
        <svg viewBox="0 0 32 16" className="h-4 w-7" aria-hidden>
          <path
            d="M1 9.5h6.5l1.8-5 2.6 9 2.2-4H31"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium tracking-[-0.03em] text-fg">SASHecg</span>
        <span className="block truncate text-[11px] text-fg-3">Local ECG report anonymizer</span>
      </span>
    </div>
  )
}
