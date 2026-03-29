import type { GlyphPosition, AnimatedGlyph, EffectName, EffectParams } from './types.ts'
import { effects } from './effects.ts'
import { Renderer } from './renderer.ts'

export class Animator {
  private renderer: Renderer
  private rafId: number = 0
  private startTime: number = 0
  private running: boolean = false
  private continuous: boolean = false

  private fromGlyphs: GlyphPosition[] = []
  private toGlyphs: GlyphPosition[] = []
  private currentEffect: EffectName = 'morph'
  private font: string = ''
  private color: string = '#f0f0f0'

  // Layout guide
  private guideX: number = 0
  private guideY: number = 0
  private guideWidth: number = 0
  private guideHeight: number = 0

  params: EffectParams = {
    duration: 1200,
    stagger: 30,
    easing: 'easeInOutCubic',
    scatterRadius: 400,
    rotationIntensity: 3,
    waveAmplitude: 20,
    waveFrequency: 3,
    waveSpeed: 2,
  }

  constructor(renderer: Renderer) {
    this.renderer = renderer
  }

  setFont(font: string) {
    this.font = font
  }

  setColor(color: string) {
    this.color = color
  }

  setGlyphs(from: GlyphPosition[], to: GlyphPosition[]) {
    this.fromGlyphs = from
    this.toGlyphs = to
  }

  setEffect(effect: EffectName) {
    this.currentEffect = effect
    this.continuous = effect === 'wave'
  }

  setGuide(x: number, y: number, width: number, height: number) {
    this.guideX = x
    this.guideY = y
    this.guideWidth = width
    this.guideHeight = height
  }

  play() {
    this.startTime = performance.now()
    this.running = true
    if (!this.rafId) this.tick()
  }

  stop() {
    this.running = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
  }

  // Render the "to" state as-is (static display)
  renderStatic() {
    const glyphs: AnimatedGlyph[] = this.toGlyphs.map(g => ({
      char: g.char,
      x: g.x,
      y: g.y,
      width: g.width,
      opacity: 1,
      scale: 1,
      rotation: 0,
    }))
    this.draw(glyphs)
  }

  private draw(glyphs: AnimatedGlyph[]) {
    this.renderer.clear()
    if (this.guideWidth > 0) {
      this.renderer.drawWidthGuide(this.guideX, this.guideY, this.guideWidth, this.guideHeight)
    }
    this.renderer.drawGlyphs(glyphs, this.font, this.color)
  }

  private tick = () => {
    if (!this.running) {
      this.rafId = 0
      return
    }

    const now = performance.now()
    const elapsed = now - this.startTime
    const duration = this.params.duration

    let t: number
    if (this.continuous) {
      t = 1 // Wave uses time, not t
    } else {
      t = Math.min(elapsed / duration, 1)
    }

    const glyphs = effects[this.currentEffect](
      this.fromGlyphs,
      this.toGlyphs,
      t,
      now,
      this.params,
    )
    this.draw(glyphs)

    if (t < 1 || this.continuous) {
      this.rafId = requestAnimationFrame(this.tick)
    } else {
      this.running = false
      this.rafId = 0
    }
  }

  get isRunning() {
    return this.running
  }
}
