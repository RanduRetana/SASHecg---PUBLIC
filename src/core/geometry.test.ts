import { expect, test } from 'bun:test'
import {
  applyHandle,
  clampRect,
  normalizedToPixels,
  placeNewRect,
  pointerToNormalized,
  rectsEqual,
  rectsForPage,
  rectsOverlap,
  sameRectList,
  withNewRect,
  withoutRect,
  DEFAULT_REDACTION,
} from './geometry'

test('normalization keeps the rectangle inside the page', () => {
  expect(clampRect({ x: -0.2, y: 0.1, width: 0.5, height: 0.2 })).toEqual({
    x: 0,
    y: 0.1,
    width: 0.5,
    height: 0.2,
  })
  expect(clampRect({ x: 0.8, y: 0.9, width: 0.5, height: 0.4 })).toEqual({
    x: 0.5,
    y: 0.6,
    width: 0.5,
    height: 0.4,
  })
  expect(clampRect({ x: 0.2, y: 0.2, width: 0.001, height: 2 })).toEqual({
    x: 0.2,
    y: 0,
    width: 0.02,
    height: 1,
  })
  expect(clampRect({ x: Number.NaN, y: 0, width: 0.2, height: 0.2 }).x).toBe(0)
})

test('pixels come from page fractions, not from the on-screen size', () => {
  expect(normalizedToPixels({ x: 0, y: 0, width: 0.3, height: 0.155 }, 1000, 2000)).toEqual({
    x: 0,
    y: 0,
    width: 300,
    height: 310,
  })
  expect(normalizedToPixels({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, 101, 101).x).toBe(25)
})

test('the pointer uses the CSS box even when the bitmap is larger', () => {
  const displayed = { left: 40, top: 80, width: 400, height: 300 }
  expect(pointerToNormalized(240, 230, displayed)).toEqual({ x: 0.5, y: 0.5 })
  expect(pointerToNormalized(0, 0, displayed)).toEqual({ x: 0, y: 0 })
  expect(pointerToNormalized(9999, 9999, displayed)).toEqual({ x: 1, y: 1 })
  expect(pointerToNormalized(40, 80, { left: 40, top: 80, width: 0, height: 0 })).toEqual({ x: 0, y: 0 })
})

test('dragging and resizing stay inside the edges', () => {
  const start = { x: 0.2, y: 0.2, width: 0.4, height: 0.3 }
  expect(rectsEqual(applyHandle(start, 'move', 0.1, -0.05), { x: 0.3, y: 0.15, width: 0.4, height: 0.3 })).toBe(true)
  expect(applyHandle(start, 'move', -1, 0).x).toBe(0)
  expect(applyHandle(start, 'e', 0.1, 0).width).toBeCloseTo(0.5)
  expect(rectsEqual(applyHandle(start, 'n', 0, 0.1), { x: 0.2, y: 0.3, width: 0.4, height: 0.2 })).toBe(true)
  expect(applyHandle(start, 'w', 0.5, 0).width).toBeGreaterThanOrEqual(0.02)
  const flipped = applyHandle(start, 'se', -0.5, -0.4)
  expect(flipped.width).toBeGreaterThanOrEqual(0.02)
  expect(flipped.height).toBeGreaterThanOrEqual(0.02)
  expect(flipped.x).toBeGreaterThanOrEqual(0)
  expect(flipped.y).toBeGreaterThanOrEqual(0)
})

test('an exception replaces the shared set only on that page', () => {
  const sharedSet = [DEFAULT_REDACTION, { x: 0.7, y: 0, width: 0.22, height: 0.12 }]
  const customSet = [
    { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
    { x: 0.1, y: 0.7, width: 0.2, height: 0.15 },
  ]
  const shared = rectsForPage(0, sharedSet, { 2: customSet })
  const custom = rectsForPage(2, sharedSet, { 2: customSet })
  const empty = rectsForPage(1, sharedSet, { 1: [] })
  expect(shared.exception).toBe(false)
  expect(sameRectList(shared.rects, sharedSet)).toBe(true)
  expect(custom.exception).toBe(true)
  expect(custom.rects).toEqual(customSet)
  expect(empty.exception).toBe(false)
  expect(sameRectList(empty.rects, sharedSet)).toBe(true)
})

test('new areas land clear of the ones already placed, and the last area cannot be deleted', () => {
  const first = withNewRect([DEFAULT_REDACTION])
  expect(first.selected).toBe(1)
  expect(first.rects).toHaveLength(2)
  expect(rectsOverlap(first.rects[0]!, first.rects[1]!)).toBe(false)
  expect(first.rects[1]!.x).toBeGreaterThanOrEqual(0)
  expect(first.rects[1]!.y).toBeGreaterThanOrEqual(0)
  expect(first.rects[1]!.x + first.rects[1]!.width).toBeLessThanOrEqual(1)
  expect(first.rects[1]!.y + first.rects[1]!.height).toBeLessThanOrEqual(1)

  const second = withNewRect(first.rects)
  expect(second.rects).toHaveLength(3)
  expect(rectsOverlap(second.rects[0]!, second.rects[2]!)).toBe(false)
  expect(rectsOverlap(second.rects[1]!, second.rects[2]!)).toBe(false)

  const crowded = placeNewRect(
    Array.from({ length: 40 }, (_, index) => ({
      x: (index % 5) * 0.2,
      y: Math.floor(index / 5) * 0.16,
      width: 0.2,
      height: 0.16,
    })),
  )
  expect(crowded.x).toBeGreaterThanOrEqual(0)
  expect(crowded.y).toBeGreaterThanOrEqual(0)
  expect(crowded.width).toBeGreaterThanOrEqual(0.02)

  expect(withoutRect([DEFAULT_REDACTION], 0)).toBe(null)
  const removed = withoutRect(second.rects, 1)
  expect(removed?.rects).toHaveLength(2)
  expect(removed?.selected).toBe(1)
  expect(sameRectList(removed?.rects ?? [], [second.rects[0]!, second.rects[2]!])).toBe(true)
})
