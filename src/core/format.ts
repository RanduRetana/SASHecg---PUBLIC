export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatMillimeters(widthPt: number, heightPt: number): string {
  const mm = (points: number) => Math.round((points / 72) * 25.4)
  return `${mm(widthPt)} × ${mm(heightPt)} mm`
}

export function formatDpi(dpi: number): string {
  return `${Math.round(dpi)} dpi`
}
