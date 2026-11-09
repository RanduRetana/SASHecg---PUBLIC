/** Ignores overlapping calls so a second click cannot start another download. */
export function createExportLock() {
  let held = false
  return {
    get busy() {
      return held
    },
    async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
      if (held) return undefined
      held = true
      try {
        return await fn()
      } finally {
        held = false
      }
    },
  }
}
