import { expect, test } from 'bun:test'

test('Vercel rewrites unknown paths such as /fishy-stew to index.html', async () => {
  const config = JSON.parse(await Bun.file('vercel.json').text()) as {
    rewrites?: { source?: string; destination?: string }[]
  }
  expect(config.rewrites).toHaveLength(1)
  expect(config.rewrites?.[0]).toEqual({ source: '/(.*)', destination: '/index.html' })
})
