import { prepareWithSegments, type PreparedTextWithSegments } from '@chenglou/pretext'
import { computeGlyphPositions, getLayoutInfo } from './layout-mapper.ts'
import { Renderer } from './renderer.ts'
import { Animator } from './animator.ts'
import { LavaExperiment } from './lava.ts'
import type { EffectName, EasingName } from './types.ts'

// ============================================================
// VIEW SWITCHING
// ============================================================
let currentView = 'animations'
const navTabs = document.querySelectorAll('.nav-tab')
const panelToggle = document.getElementById('panelToggle') as HTMLButtonElement
const animCanvas = document.getElementById('animCanvas') as HTMLCanvasElement
const lavaCanvas = document.getElementById('lavaCanvas') as HTMLCanvasElement
const animPanel = document.getElementById('animPanel') as HTMLDivElement
const lavaPanel = document.getElementById('lavaPanel') as HTMLDivElement

function switchView(view: string) {
  if (view === currentView) return
  currentView = view

  // Nav tabs
  navTabs.forEach(t => t.classList.toggle('active', (t as HTMLElement).dataset.view === view))

  // Canvases
  animCanvas.classList.toggle('hidden', view !== 'animations')
  lavaCanvas.classList.toggle('hidden', view !== 'lava')

  // Panels — close all, swap which one is available
  animPanel.classList.remove('open')
  lavaPanel.classList.remove('open')
  animPanel.classList.toggle('wrong-view', view !== 'animations')
  lavaPanel.classList.toggle('wrong-view', view !== 'lava')
  panelToggle.classList.remove('hidden')

  // Stop/start the right experiment
  if (view === 'animations') {
    lava.stop()
    renderStatic()
  } else {
    animator.stop()
    lava.resize()
    lava.start()
  }
}

navTabs.forEach(tab => {
  tab.addEventListener('click', () => switchView((tab as HTMLElement).dataset.view!))
})

// Panel toggle/close
panelToggle.addEventListener('click', () => {
  const panel = currentView === 'animations' ? animPanel : lavaPanel
  panel.classList.add('open')
  panelToggle.classList.add('hidden')
})

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    animPanel.classList.remove('open')
    lavaPanel.classList.remove('open')
    panelToggle.classList.remove('hidden')
  })
})

// ============================================================
// ANIMATIONS EXPERIMENT (existing)
// ============================================================
let prepared: PreparedTextWithSegments | null = null
let currentText =
  'Words that explode, reassemble, flow like water. Since you know exact line breaks and widths at any container size, you can smoothly animate text between layouts — morphing from one column width to another, or having text pour into a shape.'

let fontSize = 32
let lineHeightMultiplier = 1.5
let layoutWidth = 600
let prevLayoutWidth = 300

const fontFamily = 'Inter, system-ui, sans-serif'
const fontWeight = '600'

function getFont() { return `${fontWeight} ${fontSize}px ${fontFamily}` }
function getLineHeight() { return Math.round(fontSize * lineHeightMultiplier) }

const renderer = new Renderer(animCanvas)
const animator = new Animator(renderer)
animator.setColor('#f0f0f0')

// Effect buttons
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

// Sliders
function bindSlider(id: string, valId: string, fmt: (v: number) => string, cb: (v: number) => void) {
  const s = document.getElementById(id) as HTMLInputElement
  const v = document.getElementById(valId) as HTMLSpanElement
  if (!s || !v) return
  s.addEventListener('input', () => { const n = parseFloat(s.value); v.textContent = fmt(n); cb(n) })
}

bindSlider('widthSlider', 'widthValue', v => String(v), v => { prevLayoutWidth = layoutWidth; layoutWidth = v; recomputeAndAnimate() })
bindSlider('fontSizeSlider', 'fontSizeValue', v => String(v), v => { fontSize = v; reprepareAndAnimate() })
bindSlider('lineHeightSlider', 'lineHeightValue', v => (v / 100).toFixed(1), v => { lineHeightMultiplier = v / 100; recomputeAndAnimate() })
bindSlider('durationSlider', 'durationValue', v => (v / 1000).toFixed(1) + 's', v => { animator.params.duration = v })
bindSlider('staggerSlider', 'staggerValue', v => String(v), v => { animator.params.stagger = v })

const easingSelect = document.getElementById('easingSelect') as HTMLSelectElement
easingSelect?.addEventListener('change', () => { animator.params.easing = easingSelect.value as EasingName })

const textInput = document.getElementById('textInput') as HTMLTextAreaElement
textInput.value = currentText
let textDebounce: ReturnType<typeof setTimeout>
textInput?.addEventListener('input', () => {
  clearTimeout(textDebounce)
  textDebounce = setTimeout(() => { currentText = textInput.value; reprepareAndAnimate() }, 300)
})

document.getElementById('playBtn')?.addEventListener('click', () => playCurrentEffect())
document.getElementById('resetBtn')?.addEventListener('click', () => { animator.stop(); renderStatic() })

function updateEffectControls(effect: EffectName) {
  const inner = document.getElementById('effectControlsInner')!
  const section = document.getElementById('effectControls')!
  const configs: Record<string, string> = {
    morph: '', pour: '', typewriter: '', vortex: '',
    explode: `
      <div class="slider-row"><span class="slider-label">Scatter</span><input type="range" id="scatterSlider" min="100" max="1000" value="${animator.params.scatterRadius}" /><span class="slider-value" id="scatterValue">${animator.params.scatterRadius}</span></div>
      <div class="slider-row"><span class="slider-label">Rotation</span><input type="range" id="rotationSlider" min="0" max="10" value="${animator.params.rotationIntensity}" step="0.5" /><span class="slider-value" id="rotationValue">${animator.params.rotationIntensity}</span></div>`,
    wave: `
      <div class="slider-row"><span class="slider-label">Amplitude</span><input type="range" id="waveAmpSlider" min="2" max="60" value="${animator.params.waveAmplitude}" /><span class="slider-value" id="waveAmpValue">${animator.params.waveAmplitude}</span></div>
      <div class="slider-row"><span class="slider-label">Frequency</span><input type="range" id="waveFreqSlider" min="1" max="10" value="${animator.params.waveFrequency}" step="0.5" /><span class="slider-value" id="waveFreqValue">${animator.params.waveFrequency}</span></div>
      <div class="slider-row"><span class="slider-label">Speed</span><input type="range" id="waveSpeedSlider" min="0.5" max="8" value="${animator.params.waveSpeed}" step="0.5" /><span class="slider-value" id="waveSpeedValue">${animator.params.waveSpeed}</span></div>`,
  }
  const html = configs[effect] ?? ''
  inner.innerHTML = html
  section.style.display = html ? 'block' : 'none'
  if (effect === 'explode') {
    bindDyn('scatterSlider', 'scatterValue', v => String(v), v => { animator.params.scatterRadius = v })
    bindDyn('rotationSlider', 'rotationValue', v => String(v), v => { animator.params.rotationIntensity = v })
  }
  if (effect === 'wave') {
    bindDyn('waveAmpSlider', 'waveAmpValue', v => String(v), v => { animator.params.waveAmplitude = v })
    bindDyn('waveFreqSlider', 'waveFreqValue', v => String(v), v => { animator.params.waveFrequency = v })
    bindDyn('waveSpeedSlider', 'waveSpeedValue', v => String(v), v => { animator.params.waveSpeed = v })
  }
}

function bindDyn(id: string, valId: string, fmt: (v: number) => string, cb: (v: number) => void) {
  const s = document.getElementById(id) as HTMLInputElement | null
  const v = document.getElementById(valId)
  if (!s || !v) return
  s.addEventListener('input', () => { const n = parseFloat(s.value); v.textContent = fmt(n); cb(n) })
}

function prepareCurrent() { prepared = prepareWithSegments(currentText, getFont()); animator.setFont(getFont()) }

function computePositions(width: number) {
  if (!prepared) return []
  const lh = getLineHeight()
  const info = getLayoutInfo(prepared, width, lh)
  const offsetX = (renderer.width - width) / 2
  const offsetY = (renderer.height - info.height) / 2
  animator.setGuide(offsetX, offsetY, width, info.height)
  return computeGlyphPositions(prepared, width, lh, offsetX, offsetY, getFont())
}

function recomputeAndAnimate() {
  if (!prepared) return
  animator.setGlyphs(computePositions(prevLayoutWidth), computePositions(layoutWidth))
  animator.play()
}

function reprepareAndAnimate() { prepareCurrent(); recomputeAndAnimate() }

let morphFlip = false
function playCurrentEffect() {
  if (!prepared) return
  const activeBtn = effectGrid.querySelector('.effect-btn.active') as HTMLElement
  const effect = (activeBtn?.dataset.effect ?? 'morph') as EffectName
  if (effect === 'morph') {
    const narrow = Math.max(100, Math.round(layoutWidth * 0.45))
    const wA = morphFlip ? layoutWidth : narrow
    const wB = morphFlip ? narrow : layoutWidth
    morphFlip = !morphFlip
    animator.setGlyphs(computePositions(wA), computePositions(wB))
  } else {
    const to = computePositions(layoutWidth)
    animator.setGlyphs(to, to)
  }
  animator.play()
}

function renderStatic() {
  if (!prepared) return
  const to = computePositions(layoutWidth)
  animator.setGlyphs(to, to)
  animator.renderStatic()
}

// ============================================================
// CURSOR IS LAVA EXPERIMENT
// ============================================================
const lava = new LavaExperiment(lavaCanvas)

// Lava controls
const lavaLayoutSelect = document.getElementById('lavaLayout') as HTMLSelectElement
lavaLayoutSelect?.addEventListener('change', () => {
  lava.setLayout(lavaLayoutSelect.value as 'two-col' | 'three-col' | 'asymmetric' | 'single')
})

bindSlider('lavaFontSize', 'lavaFontSizeValue', v => String(v), v => { lava.setFontSize(v) })
bindSlider('lavaRadius', 'lavaRadiusValue', v => String(v), v => { lava.params.radius = v })
bindSlider('lavaForce', 'lavaForceValue', v => String(v), v => { lava.params.force = v })
bindSlider('lavaSpring', 'lavaSpringValue', v => String(v), v => { lava.params.spring = v })
bindSlider('lavaDamping', 'lavaDampingValue', v => (v / 100).toFixed(2), v => { lava.params.damping = v })

// Toggles
function bindToggle(id: string, cb: (on: boolean) => void) {
  const btn = document.getElementById(id)
  if (!btn) return
  btn.addEventListener('click', () => {
    btn.classList.toggle('on')
    cb(btn.classList.contains('on'))
  })
}
bindToggle('lavaHeatToggle', on => { lava.params.heatEnabled = on })
bindToggle('lavaRotateToggle', on => { lava.params.rotateEnabled = on })

// Lava text input
const lavaTextInput = document.getElementById('lavaTextInput') as HTMLTextAreaElement
let lavaTextDebounce: ReturnType<typeof setTimeout>
lavaTextInput?.addEventListener('input', () => {
  clearTimeout(lavaTextDebounce)
  lavaTextDebounce = setTimeout(() => { lava.setText(lavaTextInput.value) }, 300)
})

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
  renderer.resize()
  const ws = document.getElementById('widthSlider') as HTMLInputElement
  if (ws) ws.max = String(Math.floor(renderer.width * 0.9))
  if (currentView === 'animations') renderStatic()
  if (currentView === 'lava') lava.resize()
})

// ============================================================
// INIT
// ============================================================
async function init() {
  await document.fonts.ready

  // Animations
  prepareCurrent()
  const ws = document.getElementById('widthSlider') as HTMLInputElement
  if (ws) ws.max = String(Math.floor(renderer.width * 0.9))
  animator.setEffect('morph')
  updateEffectControls('morph')
  const to = computePositions(layoutWidth)
  animator.setGlyphs(to, to)
  animator.setEffect('pour')
  animator.params.duration = 1800
  const pourBtn = effectGrid.querySelector('[data-effect="pour"]') as HTMLElement
  effectGrid.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'))
  pourBtn?.classList.add('active')
  updateEffectControls('pour')
  animator.play()
  setTimeout(() => {
    const morphBtn = effectGrid.querySelector('[data-effect="morph"]') as HTMLElement
    effectGrid.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'))
    morphBtn?.classList.add('active')
    animator.setEffect('morph')
    animator.params.duration = 1200
    updateEffectControls('morph')
  }, 2200)

  // Lava — prepare text but don't start until switched to
  lava.setText(lavaTextInput.value)
}

init()
