import { mkdirSync, writeFileSync } from 'node:fs'

type RGB = [number, number, number]

const COLORS: RGB[] = [
  [253, 246, 252],
  [76, 53, 111],
  [246, 178, 255],
  [255, 198, 254],
  [206, 175, 255],
  [252, 214, 249],
  [255, 255, 255],
  [42, 24, 56],
  [193, 155, 255],
  [255, 214, 250],
  [146, 114, 197],
  [244, 236, 255],
  [90, 64, 130],
  [255, 182, 214],
  [232, 210, 255],
  [120, 90, 160],
]

const INK = 1
const BODY = 2
const BELLY = 3
const FIN = 4
const BLUSH = 5
const WHITE = 6
const PUPIL = 7
const LILAC = 8
const CHEEK = 9
const SPOON = 10
const STEAM = 11
const BOWL = 12
const CHUNK = 13
const BROTH = 14
const RIM = 15

function createGif(width: number, height: number, frames: Uint8Array[], delayCs: number): Uint8Array {
  const parts: number[] = []
  const push = (...bytes: number[]) => parts.push(...bytes)
  const le = (value: number) => push(value & 255, (value >> 8) & 255)
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)
  le(width)
  le(height)
  push(0xf3, 0x00, 0x00)
  for (const [r, g, b] of COLORS) push(r, g, b)
  push(0x21, 0xff, 0x0b)
  for (const char of 'NETSCAPE2.0') push(char.charCodeAt(0))
  push(0x03, 0x01, 0x00, 0x00, 0x00)
  for (const frame of frames) {
    push(0x21, 0xf9, 0x04, 0x00)
    le(delayCs)
    push(0x00, 0x00)
    push(0x2c)
    le(0)
    le(0)
    le(width)
    le(height)
    push(0x00, 4)
    const data = lzw(frame, 4)
    for (let offset = 0; offset < data.length; offset += 255) {
      const chunk = data.slice(offset, offset + 255)
      push(chunk.length, ...chunk)
    }
    push(0x00)
  }
  push(0x3b)
  return Uint8Array.from(parts)
}

function lzw(indices: Uint8Array, minCodeSize: number): number[] {
  const clear = 1 << minCodeSize
  const eoi = clear + 1
  let codeSize = minCodeSize + 1
  let next = eoi + 1
  const dict = new Map<string, number>()
  const bits: number[] = []
  let acc = 0
  let n = 0
  const write = (code: number, size: number) => {
    acc |= code << n
    n += size
    while (n >= 8) {
      bits.push(acc & 255)
      acc >>= 8
      n -= 8
    }
  }
  const reset = () => {
    dict.clear()
    codeSize = minCodeSize + 1
    next = eoi + 1
  }
  write(clear, codeSize)
  reset()
  let w = ''
  for (const value of indices) {
    const wk = w + String.fromCharCode(value)
    if (w.length === 0 || dict.has(wk) || wk.length === 1) w = wk
    else {
      write(w.length === 1 ? w.charCodeAt(0) : (dict.get(w) ?? 0), codeSize)
      if (next < 4096) {
        dict.set(wk, next)
        if (next === 1 << codeSize && codeSize < 12) codeSize += 1
        next += 1
      } else {
        write(clear, codeSize)
        reset()
      }
      w = String.fromCharCode(value)
    }
  }
  if (w) write(w.length === 1 ? w.charCodeAt(0) : (dict.get(w) ?? w.charCodeAt(0)), codeSize)
  write(eoi, codeSize)
  if (n > 0) bits.push(acc & 255)
  return bits
}

function blank(width: number, height: number) {
  return new Uint8Array(width * height)
}

function plot(frame: Uint8Array, width: number, x: number, y: number, color: number) {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= width || py >= frame.length / width) return
  frame[py * width + px] = color
}

function disc(frame: Uint8Array, width: number, cx: number, cy: number, rx: number, ry: number, color: number) {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) plot(frame, width, cx + x, cy + y, color)
    }
  }
}

function fishFrame(step: number, width: number, height: number) {
  const frame = blank(width, height)
  const bob = Math.sin((step / 8) * Math.PI * 2) * 3
  const cx = 78
  const cy = 58 + bob
  const tail = Math.sin((step / 8) * Math.PI * 2) * 5
  disc(frame, width, cx - 34, cy + tail, 14, 16, FIN)
  disc(frame, width, cx, cy, 36, 24, BODY)
  disc(frame, width, cx + 4, cy + 6, 22, 12, BELLY)
  disc(frame, width, cx + 8, cy - 16, 10, 6, FIN)
  disc(frame, width, cx + 22, cy - 2, 9, 8, WHITE)
  disc(frame, width, cx + 24, cy - 1, 4, 4, PUPIL)
  plot(frame, width, cx + 25, cy - 3, WHITE)
  disc(frame, width, cx + 8, cy + 8, 4, 3, CHEEK)
  for (let i = -6; i <= 6; i++) plot(frame, width, cx + 6 + i, cy + 2 + Math.abs(i) * 0.15, INK)
  disc(frame, width, 28 + (step % 4), 24 - step * 4, 3, 3, LILAC)
  disc(frame, width, 40, 70 - step * 3, 2, 2, BLUSH)
  return frame
}

function stewFrame(step: number, width: number, height: number) {
  const frame = blank(width, height)
  disc(frame, width, 80, 78, 46, 18, BOWL)
  disc(frame, width, 80, 70, 40, 14, BROTH)
  disc(frame, width, 80, 62, 42, 6, RIM)
  disc(frame, width, 62, 66 + Math.sin(step) * 1.5, 8, 6, CHUNK)
  disc(frame, width, 84, 64 + Math.cos(step) * 1.5, 7, 5, BELLY)
  disc(frame, width, 100, 68, 6, 5, LILAC)
  for (let y = 0; y < 16; y++) plot(frame, width, 118, 74 - y, SPOON)
  disc(frame, width, 118, 54, 7, 4, SPOON)
  const rise = step * 3
  disc(frame, width, 64, 40 - rise, 5, 4, STEAM)
  disc(frame, width, 82, 32 - rise, 6, 5, STEAM)
  disc(frame, width, 98, 38 - rise, 4, 4, WHITE)
  return frame
}

const width = 160
const height = 112
const fish = Array.from({ length: 8 }, (_, step) => fishFrame(step, width, height))
const stew = Array.from({ length: 8 }, (_, step) => stewFrame(step, width, height))
mkdirSync(new URL('../public/fishy/', import.meta.url), { recursive: true })
writeFileSync(new URL('../public/fishy/fishy.gif', import.meta.url), createGif(width, height, fish, 12))
writeFileSync(new URL('../public/fishy/stew.gif', import.meta.url), createGif(width, height, stew, 14))
console.log('wrote fish gifs')
