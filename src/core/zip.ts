import { unzipSync, zip } from 'fflate'

export function buildZip(files: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const input: Record<string, Uint8Array> = {}
  for (const file of files) {
    if (input[file.name]) {
      throw new Error(`Duplicate file name: ${file.name}`)
    }
    input[file.name] = file.data
  }
  return new Promise((resolve, reject) => {
    zip(input, { level: 0 }, (error, data) => {
      if (error || !data) reject(error ?? new Error('Could not create the ZIP.'))
      else resolve(data)
    })
  })
}

export function readZip(data: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(data)
}
