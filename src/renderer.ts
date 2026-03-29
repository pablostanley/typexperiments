import type { AnimatedGlyph } from './types.ts'

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private dpr: number = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, rect.width)
    const h = Math.max(1, rect.height)
    this.canvas.width = w * this.dpr
    this.canvas.height = h * this.dpr
    this.ctx.scale(this.dpr, this.dpr)
  }

  get width() {
    return this.canvas.width / this.dpr
  }

  get height() {
    return this.canvas.height / this.dpr
  }

  clear() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.ctx.fillStyle = '#0a0a0a'
    this.ctx.fillRect(0, 0, this.width, this.height)
  }

  drawGlyphs(glyphs: AnimatedGlyph[], font: string, color: string = '#f0f0f0') {
    const ctx = this.ctx

    ctx.font = font
    ctx.textBaseline = 'top'

    // Batch: render simple glyphs (no rotation, scale ~1, full opacity) together
    // and per-glyph transform for the rest
    for (const glyph of glyphs) {
      if (glyph.opacity <= 0.005) continue

      const needsTransform = Math.abs(glyph.rotation) > 0.001 || Math.abs(glyph.scale - 1) > 0.001

      if (needsTransform) {
        ctx.save()
        ctx.translate(glyph.x + glyph.width / 2, glyph.y)
        ctx.rotate(glyph.rotation)
        ctx.scale(glyph.scale, glyph.scale)
        ctx.globalAlpha = glyph.opacity
        ctx.fillStyle = color
        ctx.fillText(glyph.char, -glyph.width / 2, 0)
        ctx.restore()
      } else {
        ctx.globalAlpha = glyph.opacity
        ctx.fillStyle = color
        ctx.fillText(glyph.char, glyph.x, glyph.y)
      }
    }

    ctx.globalAlpha = 1
  }

  // Draw a subtle guide showing the container width
  drawWidthGuide(x: number, y: number, width: number, height: number) {
    const ctx = this.ctx
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.strokeRect(x, y, width, height)
    ctx.setLineDash([])
  }
}
