import { expect, test } from 'bun:test'
import { createExportLock } from './exportLock'

test('a second click does not run the export again', async () => {
  const lock = createExportLock()
  let runs = 0
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  const first = lock.run(async () => {
    runs += 1
    await gate
    return 'ok'
  })
  const second = await lock.run(async () => {
    runs += 1
    return 'otra'
  })

  expect(second).toBeUndefined()
  expect(runs).toBe(1)
  release?.()
  expect(await first).toBe('ok')
  expect(await lock.run(async () => 'despues')).toBe('despues')
  expect(runs).toBe(1)
})
