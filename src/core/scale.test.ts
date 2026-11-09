import { expect, test } from 'bun:test'
import { chooseRenderScale } from './scale'

test('a letter page stays near 220 dpi', () => {
  const choice = chooseRenderScale(612, 792)
  expect(choice.dpi).toBeGreaterThan(200)
  expect(choice.dpi).toBeLessThan(230)
  expect(choice.capped).toBe(false)
  expect(612 * choice.scale * 792 * choice.scale).toBeLessThanOrEqual(8_000_000)
})

test('a huge page drops below 200 dpi instead of allocating a giant bitmap', () => {
  const choice = chooseRenderScale(2000, 2000)
  expect(choice.capped).toBe(true)
  expect(choice.dpi).toBeLessThan(200)
  expect(2000 * choice.scale * 2000 * choice.scale).toBeLessThanOrEqual(8_000_000 + 1)
})

test('memory pressure uses a lower target', () => {
  const calm = chooseRenderScale(612, 792)
  const pressured = chooseRenderScale(612, 792, { memoryPressure: true })
  expect(pressured.dpi).toBeLessThan(calm.dpi)
  expect(pressured.dpi).toBeLessThanOrEqual(160.1)
})

test('a 72 dpi test target is not marked as a clinical cap', () => {
  const choice = chooseRenderScale(240, 320, { targetDpi: 72 })
  expect(choice.dpi).toBeCloseTo(72)
  expect(choice.capped).toBe(false)
})
