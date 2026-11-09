import { createCanvas } from '@napi-rs/canvas'
import { expect, test } from 'bun:test'
import { applyOpaqueRect, burnRedaction, burnRedactions, MASK_COLOR } from './redact'

test('the opaque rectangle replaces pixels and leaves no transparency', () => {
  const width = 10
  const height = 8
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255
    pixels[i + 1] = 0
    pixels[i + 2] = 0
    pixels[i + 3] = 128
  }

  applyOpaqueRect(pixels, width, height, { x: 0, y: 0, width: 0.5, height: 1 })

  const at = (x: number, y: number) => {
    const index = (y * width + x) * 4
    return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]]
  }

  expect(at(0, 0)).toEqual([MASK_COLOR.r, MASK_COLOR.g, MASK_COLOR.b, 255])
  expect(at(4, 7)).toEqual([MASK_COLOR.r, MASK_COLOR.g, MASK_COLOR.b, 255])
  expect(at(5, 0)).toEqual([255, 0, 0, 128])
  expect(at(9, 4)).toEqual([255, 0, 0, 128])
})

test('burning the mask on a canvas replaces the same zone', () => {
  const canvas = createCanvas(20, 10)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(0, 0, 20, 10)
  burnRedaction(ctx as unknown as CanvasRenderingContext2D, 20, 10, { x: 0, y: 0.25, width: 0.5, height: 0.5 })

  const masked = ctx.getImageData(2, 4, 1, 1).data
  const kept = ctx.getImageData(16, 2, 1, 1).data
  expect([masked[0], masked[1], masked[2], masked[3]]).toEqual([17, 17, 17, 255])
  expect([kept[0], kept[1], kept[2], kept[3]]).toEqual([0, 0, 255, 255])
})

test('every rectangle is burned and the gap between them stays', () => {
  const canvas = createCanvas(100, 40)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, 100, 40)
  burnRedactions(ctx as unknown as CanvasRenderingContext2D, 100, 40, [
    { x: 0, y: 0, width: 0.3, height: 0.5 },
    { x: 0.6, y: 0.25, width: 0.3, height: 0.5 },
  ])
  const left = ctx.getImageData(10, 5, 1, 1).data
  const right = ctx.getImageData(70, 20, 1, 1).data
  const gap = ctx.getImageData(45, 5, 1, 1).data
  expect([left[0], left[1], left[2], left[3]]).toEqual([17, 17, 17, 255])
  expect([right[0], right[1], right[2], right[3]]).toEqual([17, 17, 17, 255])
  expect([gap[0], gap[1], gap[2], gap[3]]).toEqual([255, 0, 0, 255])
})
