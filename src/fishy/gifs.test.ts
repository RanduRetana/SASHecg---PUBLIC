import { expect, test } from 'bun:test'

test('the fish gifs are local GIF89a animations', async () => {
  for (const name of ['fishy.gif', 'stew.gif']) {
    const bytes = new Uint8Array(await Bun.file(`public/fishy/${name}`).arrayBuffer())
    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe('GIF89a')
    expect(new TextDecoder().decode(bytes)).toContain('NETSCAPE2.0')
    expect(bytes.length).toBeGreaterThan(500)
    expect(bytes.length).toBeLessThan(20_000)
  }
})
