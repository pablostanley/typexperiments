import { prepareWithSegments, type PreparedTextWithSegments } from '@chenglou/pretext'
import { computeGlyphPositions, getLayoutInfo } from './layout-mapper.ts'
import { Renderer } from './renderer.ts'
import { Animator } from './animator.ts'
import type { EffectName, EasingName } from './types.ts'

// --- State ---
let prepared: PreparedTextWithSegments | null = null
let currentText =
  'Words that explode, reassemble, flow like water. Since you know exact line breaks and widths at any container size, you can smoothly animate text between layouts — morphing from one column width to another, or having text pour into a shape.'

let fontSize = 32
let lineHeightMultiplier = 1.5
let layoutWidth = 600
let prevLayoutWidth = 300 // For morph: the "from" width

const fontFamily = 'Inter, system-ui, sans-serif'
const fontWeight = '600'

function getFont() {
  return `${fontWeight} ${fontSize}px ${fontFamily}`
}

function getLineHeight() {
  return Math.round(fontSize * lineHeightMultiplier)
}

// --- Setup ---
const canvas = document.getElementById('canvas') as HTMLCanvasElement
const renderer = new Renderer(canvas)
const animator = new Animator(renderer)
animator.setColor('#f0f0f0')

// --- Control Panel ---
const panelToggle = document.getElementById('panelToggle') as HTMLButtonElement
const controlPanel = document.getElementById('controlPanel') as HTMLDivElement
const panelClose = document.getElementById('panelClose') as HTMLButtonElement

panelToggle.addEventListener('click', () => {
  controlPanel.classList.add('open')
  panelToggle.classList.add('hidden')
})
panelClose.addEventListener('click', () => {
  controlPanel.classList.remove('open')
  panelToggle.classList.remove('hidden')
})

// --- Effect Buttons ---
const effectGrid = document.getElementById('effectGrid')!
effectGrid.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.effect-btn') as HTMLElement | null
  if (!btn) return
  effectGrid.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  const effect = btn.dataset.effect as EffectName
  animator.setEffect(effect)
  updateEffectControls(effect)
  playCurrentEffect()
})

// --- Sliders ---
function bindSlider(
  sliderId: string,
  valueId: string,
  format: (v: number) => string,
  onChange: (v: number) => void,
) {
  const slider = document.getElementById(sliderId) as HTMLInputElement
  const valueEl = document.getElementById(valueId) as HTMLSpanElement
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value)
    valueEl.textContent = format(v)
    onChange(v)
  })
}

bindSlider('widthSlider', 'widthValue', v => String(v), v => {
  prevLayoutWidth = layoutWidth
  layoutWidth = v
  recomputeAndAnimate()
})

bindSlider('fontSizeSlider', 'fontSizeValue', v => String(v), v => {
  fontSize = v
  reprepareAndAnimate()
})

bindSlider('lineHeightSlider', 'lineHeightValue', v => (v / 100).toFixed(1), v => {
  lineHeightMultiplier = v / 100
  recomputeAndAnimate()
})

bindSlider('durationSlider', 'durationValue', v => (v / 1000).toFixed(1) + 's', v => {
  animator.params.duration = v
})

bindSlider('staggerSlider', 'staggerValue', v => String(v), v => {
  animator.params.stagger = v
})

// Easing
const easingSelect = document.getElementById('easingSelect') as HTMLSelectElement
easingSelect.addEventListener('change', () => {
  animator.params.easing = easingSelect.value as EasingName
})

// Text input
const textInput = document.getElementById('textInput') as HTMLTextAreaElement
textInput.value = currentText
let textDebounce: ReturnType<typeof setTimeout>
textInput.addEventListener('input', () => {
  clearTimeout(textDebounce)
  textDebounce = setTimeout(() => {
    currentText = textInput.value
    reprepareAndAnimate()
  }, 300)
})

// Play / Reset
const playBtn = document.getElementById('playBtn') as HTMLButtonElement
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement

playBtn.addEventListener('click', () => playCurrentEffect())
resetBtn.addEventListener('click', () => {
  animator.stop()
  renderStatic()
})

// --- Effect-specific controls ---
function updateEffectControls(effect: EffectName) {
  const inner = document.getElementById('effectControlsInner')!
  const section = document.getElementById('effectControls')!

  const configs: Record<string, string> = {
    morph: '',
    explode: `
      <div class="slider-row">
        <span class="slider-label">Scatter</span>
        <input type="range" id="scatterSlider" min="100" max="1000" value="${animator.params.scatterRadius}" />
        <span class="slider-value" id="scatterValue">${animator.params.scatterRadius}</span>
      </div>
      <div class="slider-row">
        <span class="slider-label">Rotation</span>
        <input type="range" id="rotationSlider" min="0" max="10" value="${animator.params.rotationIntensity}" step="0.5" />
        <span class="slider-value" id="rotationValue">${animator.params.rotationIntensity}</span>
      </div>
    `,
    pour: '',
    wave: `
      <div class="slider-row">
        <span class="slider-label">Amplitude</span>
        <input type="range" id="waveAmpSlider" min="2" max="60" value="${animator.params.waveAmplitude}" />
        <span class="slider-value" id="waveAmpValue">${animator.params.waveAmplitude}</span>
      </div>
      <div class="slider-row">
        <span class="slider-label">Frequency</span>
        <input type="range" id="waveFreqSlider" min="1" max="10" value="${animator.params.waveFrequency}" step="0.5" />
        <span class="slider-value" id="waveFreqValue">${animator.params.waveFrequency}</span>
      </div>
      <div class="slider-row">
        <span class="slider-label">Speed</span>
        <input type="range" id="waveSpeedSlider" min="0.5" max="8" value="${animator.params.waveSpeed}" step="0.5" />
        <span class="slider-value" id="waveSpeedValue">${animator.params.waveSpeed}</span>
      </div>
    `,
    typewriter: '',
    vortex: '',
  }

  const html = configs[effect] ?? ''
  inner.innerHTML = html
  section.style.display = html ? 'block' : 'none'

  // Bind dynamic sliders
  if (effect === 'explode') {
    bindDynamic('scatterSlider', 'scatterValue', v => String(v), v => { animator.params.scatterRadius = v })
    bindDynamic('rotationSlider', 'rotationValue', v => String(v), v => { animator.params.rotationIntensity = v })
  }
  if (effect === 'wave') {
    bindDynamic('waveAmpSlider', 'waveAmpValue', v => String(v), v => { animator.params.waveAmplitude = v })
    bindDynamic('waveFreqSlider', 'waveFreqValue', v => String(v), v => { animator.params.waveFrequency = v })
    bindDynamic('waveSpeedSlider', 'waveSpeedValue', v => String(v), v => { animator.params.waveSpeed = v })
  }
}

function bindDynamic(
  sliderId: string,
  valueId: string,
  format: (v: number) => string,
  onChange: (v: number) => void,
) {
  const slider = document.getElementById(sliderId)
  const valueEl = document.getElementById(valueId)
  if (!slider || !valueEl) return
  slider.addEventListener('input', () => {
    const v = parseFloat((slider as HTMLInputElement).value)
    valueEl.textContent = format(v)
    onChange(v)
  })
}

// --- Core Logic ---

function prepareCurrent() {
  const font = getFont()
  prepared = prepareWithSegments(currentText, font)
  animator.setFont(font)
}

function computePositions(width: number) {
  if (!prepared) return []
  const lh = getLineHeight()
  const info = getLayoutInfo(prepared, width, lh)

  // Center vertically and horizontally on canvas
  const offsetX = (renderer.width - width) / 2
  const offsetY = (renderer.height - info.height) / 2

  animator.setGuide(offsetX, offsetY, width, info.height)

  return computeGlyphPositions(prepared, width, lh, offsetX, offsetY, getFont())
}

function recomputeAndAnimate() {
  if (!prepared) return
  const fromGlyphs = computePositions(prevLayoutWidth)
  const toGlyphs = computePositions(layoutWidth)
  animator.setGlyphs(fromGlyphs, toGlyphs)
  animator.play()
}

function reprepareAndAnimate() {
  prepareCurrent()
  recomputeAndAnimate()
}

let morphFlip = false

function playCurrentEffect() {
  if (!prepared) return
  const activeBtn = effectGrid.querySelector('.effect-btn.active') as HTMLElement
  const effect = (activeBtn?.dataset.effect ?? 'morph') as EffectName

  if (effect === 'morph') {
    // Toggle between narrow and current width so replay always shows movement
    const narrowWidth = Math.max(100, Math.round(layoutWidth * 0.45))
    const widthA = morphFlip ? layoutWidth : narrowWidth
    const widthB = morphFlip ? narrowWidth : layoutWidth
    morphFlip = !morphFlip
    const fromGlyphs = computePositions(widthA)
    const toGlyphs = computePositions(widthB)
    animator.setGlyphs(fromGlyphs, toGlyphs)
  } else {
    // Other effects: animate into the current layout
    const toGlyphs = computePositions(layoutWidth)
    animator.setGlyphs(toGlyphs, toGlyphs)
  }
  animator.play()
}

function renderStatic() {
  if (!prepared) return
  const toGlyphs = computePositions(layoutWidth)
  animator.setGlyphs(toGlyphs, toGlyphs)
  animator.renderStatic()
}

// --- Resize ---
window.addEventListener('resize', () => {
  renderer.resize()
  // Update max width slider
  const widthSlider = document.getElementById('widthSlider') as HTMLInputElement
  widthSlider.max = String(Math.floor(renderer.width * 0.9))
  renderStatic()
})

// --- Init ---
async function init() {
  // Wait for Inter font to load
  await document.fonts.ready

  prepareCurrent()

  // Set slider max to canvas width
  const widthSlider = document.getElementById('widthSlider') as HTMLInputElement
  widthSlider.max = String(Math.floor(renderer.width * 0.9))

  // Initial effect setup
  animator.setEffect('morph')
  updateEffectControls('morph')

  // Render static first, then auto-play pour to introduce
  const toGlyphs = computePositions(layoutWidth)
  animator.setGlyphs(toGlyphs, toGlyphs)
  animator.setEffect('pour')
  animator.params.duration = 1800

  // Select the pour button temporarily
  const pourBtn = effectGrid.querySelector('[data-effect="pour"]') as HTMLElement
  effectGrid.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'))
  pourBtn?.classList.add('active')
  updateEffectControls('pour')

  animator.play()

  // After intro, switch back to morph
  setTimeout(() => {
    const morphBtn = effectGrid.querySelector('[data-effect="morph"]') as HTMLElement
    effectGrid.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'))
    morphBtn?.classList.add('active')
    animator.setEffect('morph')
    animator.params.duration = 1200
    updateEffectControls('morph')
  }, 2200)
}

init()
