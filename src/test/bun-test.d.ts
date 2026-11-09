declare const Bun: {
  file(path: string): { arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }
}

declare module 'bun:test' {
  interface Matchers {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toBeCloseTo(expected: number, digits?: number): void
    toBeGreaterThan(expected: number): void
    toBeGreaterThanOrEqual(expected: number): void
    toBeLessThan(expected: number): void
    toBeLessThanOrEqual(expected: number): void
    toBeUndefined(): void
    toHaveLength(expected: number): void
    toContain(expected: unknown): void
    toThrow(expected?: unknown): void
    toBeInstanceOf(expected: unknown): void
    toBeDefined(): void
    toMatchObject(expected: unknown): void
  }

  interface Expectation extends Matchers {
    not: Matchers
    rejects: Matchers
  }

  export function expect(actual: unknown, message?: string): Expectation
  export function test(name: string, fn: () => void | Promise<void>, timeout?: number): void
}
