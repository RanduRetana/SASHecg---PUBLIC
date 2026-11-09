import { useEffect, useRef } from 'react'
import { MASK_CSS } from '@/core/redact'
import { burnStudyLabel, type StudyRotation } from '@/core/studyCode'

/** The same burn used in the exported image, drawn at the size of this on-screen rectangle. */
export function StudyLabelPreview({
  width,
  height,
  text,
  rotation,
}: {
  width: number
  height: number
  text: string
  rotation: StudyRotation
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || width < 2 || height < 2) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pixelWidth = Math.max(1, Math.round(width * dpr))
    const pixelHeight = Math.max(1, Math.round(height * dpr))
    canvas.width = pixelWidth
    canvas.height = pixelHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, pixelWidth, pixelHeight)
    ctx.fillStyle = MASK_CSS
    ctx.fillRect(0, 0, pixelWidth, pixelHeight)
    burnStudyLabel(ctx, pixelWidth, pixelHeight, { x: 0, y: 0, width: 1, height: 1 }, text, rotation)
  }, [width, height, text, rotation])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
}
