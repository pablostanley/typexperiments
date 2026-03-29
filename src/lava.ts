import { prepareWithSegments, layoutWithLines, type PreparedTextWithSegments } from '@chenglou/pretext'
import type { GlyphPosition } from './types.ts'
import { computeGlyphPositions } from './layout-mapper.ts'

type LavaGlyph = GlyphPosition & {
  // Spring physics state
  dx: number  // displacement x
  dy: number  // displacement y
  vx: number  // velocity x
  vy: number  // velocity y
}

type LayoutMode = 'two-col' | 'three-col' | 'asymmetric' | 'single'

export type LavaParams = {
  radius: number
  force: number
  spring: number
  damping: number
  heatEnabled: boolean
  rotateEnabled: boolean
  layout: LayoutMode
}

export class LavaExperiment {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private dpr: number = 1
  private glyphs: LavaGlyph[] = []
  private prepared: PreparedTextWithSegments | null = null
  private text: string = ''
  private rafId: number = 0
  private mouseX: number = -9999
  private mouseY: number = -9999
  private running: boolean = false
  private contentTop: number = 0
  private contentBottom: number = 0

  params: LavaParams = {
    radius: 140,
    force: 150,
    spring: 20,
    damping: 0.75,
    heatEnabled: true,
    rotateEnabled: true,
    layout: 'two-col',
  }

  private fontSize = 16
  private lineHeight = 26
  private font = '400 16px "Playfair Display", Georgia, serif'

  setFontSize(size: number) {
    this.fontSize = size
    this.lineHeight = Math.round(size * 1.6)
    this.font = `400 ${size}px "Playfair Display", Georgia, serif`
    if (this.text) { this.prepare(); this.recomputeLayout() }
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect()
      this.mouseX = e.clientX - rect.left
      this.mouseY = e.clientY - rect.top
    })
    this.canvas.addEventListener('mouseleave', () => {
      this.mouseX = -9999
      this.mouseY = -9999
    })
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, rect.width)
    const h = Math.max(1, rect.height)
    this.canvas.width = w * this.dpr
    this.canvas.height = h * this.dpr
    if (this.text) { this.prepare(); this.recomputeLayout() }
  }

  get width() { return this.canvas.width / this.dpr }
  get height() { return this.canvas.height / this.dpr }

  setText(text: string) {
    this.text = text
    this.prepare()
    this.recomputeLayout()
  }

  setLayout(layout: LayoutMode) {
    this.params.layout = layout
    if (this.prepared) this.recomputeLayout()
  }

  private prepare() {
    this.prepared = prepareWithSegments(this.text, this.font)
  }

  private recomputeLayout() {
    if (!this.prepared) return

    const padding = 60
    const gap = 40
    const availWidth = this.width - padding * 2

    let columns: { x: number; width: number }[] = []

    switch (this.params.layout) {
      case 'two-col': {
        const colW = (availWidth - gap) / 2
        columns = [
          { x: padding, width: colW },
          { x: padding + colW + gap, width: colW },
        ]
        break
      }
      case 'three-col': {
        const colW = (availWidth - gap * 2) / 3
        columns = [
          { x: padding, width: colW },
          { x: padding + colW + gap, width: colW },
          { x: padding + (colW + gap) * 2, width: colW },
        ]
        break
      }
      case 'asymmetric': {
        const sideW = availWidth * 0.32
        const mainW = availWidth - sideW - gap
        columns = [
          { x: padding, width: sideW },
          { x: padding + sideW + gap, width: mainW },
        ]
        break
      }
      case 'single': {
        const colW = Math.min(availWidth, 560)
        const offsetX = (this.width - colW) / 2
        columns = [{ x: offsetX, width: colW }]
        break
      }
    }

    // First pass: compute glyphs at y=0, then find total height to center
    const allGlyphs: GlyphPosition[] = []
    let textOffset = 0
    const fullText = this.text
    const totalWidth = columns.reduce((s, c) => s + c.width, 0)

    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci]!
      const proportion = col.width / totalWidth
      const charCount = Math.round(fullText.length * proportion)
      const colText = ci === columns.length - 1
        ? fullText.slice(textOffset)
        : fullText.slice(textOffset, textOffset + charCount)

      if (!colText.trim()) continue

      const colPrepared = prepareWithSegments(colText, this.font)
      const colGlyphs = computeGlyphPositions(
        colPrepared, col.width, this.lineHeight, col.x, 0, this.font
      )

      for (const g of colGlyphs) {
        g.globalIndex += textOffset
        allGlyphs.push(g)
      }

      textOffset += colText.length
    }

    // Find max y extent across all columns, then center vertically
    let maxY = 0
    for (const g of allGlyphs) {
      const bottom = g.y + this.lineHeight
      if (bottom > maxY) maxY = bottom
    }
    const offsetY = Math.max(0, (this.height - maxY) / 2)
    for (const g of allGlyphs) {
      g.y += offsetY
    }
    this.contentTop = offsetY
    this.contentBottom = offsetY + maxY

    // Convert to LavaGlyphs, preserving existing physics state where possible
    const oldMap = new Map<number, LavaGlyph>()
    for (const g of this.glyphs) oldMap.set(g.globalIndex, g)

    this.glyphs = allGlyphs.map(g => {
      const old = oldMap.get(g.globalIndex)
      return {
        ...g,
        dx: old?.dx ?? 0,
        dy: old?.dy ?? 0,
        vx: old?.vx ?? 0,
        vy: old?.vy ?? 0,
      }
    })
  }

  start() {
    if (this.running) return
    this.running = true
    this.tick()
  }

  stop() {
    this.running = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
  }

  private tick = () => {
    if (!this.running) { this.rafId = 0; return }

    this.updatePhysics()
    this.render()

    this.rafId = requestAnimationFrame(this.tick)
  }

  private updatePhysics() {
    const { radius, force, spring, damping } = this.params
    const springK = spring * 0.04  // much stiffer spring
    const dampK = damping / 100
    const radiusSq = radius * radius

    for (const g of this.glyphs) {
      // Cursor repulsion — inverse square falloff for magnetic feel
      const gCenterX = g.x + g.width / 2 + g.dx
      const gCenterY = g.y + this.fontSize / 2 + g.dy
      const dxMouse = gCenterX - this.mouseX
      const dyMouse = gCenterY - this.mouseY
      const distSq = dxMouse * dxMouse + dyMouse * dyMouse

      if (distSq < radiusSq && distSq > 1) {
        const dist = Math.sqrt(distSq)
        const normDist = dist / radius
        // Inverse-square-ish: very strong up close, drops fast
        const strength = force * 0.4 * Math.pow(1 - normDist, 2) / (normDist + 0.1)
        g.vx += (dxMouse / dist) * strength
        g.vy += (dyMouse / dist) * strength
      }

      // Spring back to origin (stiff)
      g.vx -= g.dx * springK
      g.vy -= g.dy * springK

      // Damping
      g.vx *= dampK
      g.vy *= dampK

      // Integrate
      g.dx += g.vx
      g.dy += g.vy
    }
  }

  private render() {
    const ctx = this.ctx
    const dpr = this.dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, this.width, this.height)

    ctx.font = this.font
    ctx.textBaseline = 'top'

    const { radius, heatEnabled, rotateEnabled } = this.params
    const radiusSq = radius * radius

    for (const g of this.glyphs) {
      const px = g.x + g.dx
      const py = g.y + g.dy

      // Distance to cursor for heat effect
      const dxMouse = (g.x + g.width / 2 + g.dx) - this.mouseX
      const dyMouse = (g.y + this.fontSize / 2 + g.dy) - this.mouseY
      const distSq = dxMouse * dxMouse + dyMouse * dyMouse

      let color = '#e8e4de'
      let rotation = 0

      if (heatEnabled && distSq < radiusSq * 2.25) {
        const dist = Math.sqrt(distSq)
        const norm = dist / radius
        // Discrete color bands: orange (closest) → yellow → white (far)
        if (norm < 0.4) {
          color = '#ff6b2b'  // hot orange
        } else if (norm < 0.7) {
          color = '#ffb830'  // warm yellow
        } else if (norm < 1.0) {
          color = '#fff1cc'  // warm white
        }
        // beyond 1.0 stays default #e8e4de
      }

      if (rotateEnabled) {
        const displacement = Math.sqrt(g.dx * g.dx + g.dy * g.dy)
        rotation = displacement * 0.008 * (g.globalIndex % 2 === 0 ? 1 : -1)
      }

      if (Math.abs(rotation) > 0.001) {
        ctx.save()
        ctx.translate(px + g.width / 2, py + this.fontSize / 2)
        ctx.rotate(rotation)
        ctx.fillStyle = color
        ctx.fillText(g.char, -g.width / 2, -this.fontSize / 2)
        ctx.restore()
      } else {
        ctx.fillStyle = color
        ctx.fillText(g.char, px, py)
      }
    }

    // Draw subtle column dividers
    this.drawColumnGuides(ctx)
  }

  private drawColumnGuides(ctx: CanvasRenderingContext2D) {
    const padding = 60
    const gap = 40
    const availWidth = this.width - padding * 2
    const top = this.contentTop - 10
    const bottom = this.contentBottom + 10

    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 1

    if (this.params.layout === 'two-col') {
      const x = padding + (availWidth - gap) / 2 + gap / 2
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke()
    } else if (this.params.layout === 'three-col') {
      const colW = (availWidth - gap * 2) / 3
      for (let i = 1; i <= 2; i++) {
        const x = padding + colW * i + gap * (i - 0.5)
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke()
      }
    } else if (this.params.layout === 'asymmetric') {
      const sideW = availWidth * 0.32
      const x = padding + sideW + gap / 2
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke()
    }
  }
}
