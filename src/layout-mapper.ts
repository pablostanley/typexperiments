import type { PreparedTextWithSegments } from '@chenglou/pretext'
import { layoutWithLines } from '@chenglou/pretext'
import type { GlyphPosition } from './types.ts'

// Shared canvas context for measuring individual character widths
let measureCtx: CanvasRenderingContext2D | null = null
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement('canvas')
    measureCtx = c.getContext('2d')!
  }
  return measureCtx
}

/**
 * Compute per-character (x, y) positions by rendering each line's text
 * and measuring character widths via canvas. This avoids the kerning/shaping
 * drift from summing pretext's per-segment widths at the character level.
 *
 * Strategy: use pretext for line breaking (which lines, what width), then
 * use canvas measureText for exact character-level x positions within each line.
 */
export function computeGlyphPositions(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  lineHeight: number,
  offsetX: number = 0,
  offsetY: number = 0,
  font?: string,
): GlyphPosition[] {
  const result = layoutWithLines(prepared, maxWidth, lineHeight)
  const positions: GlyphPosition[] = []
  let globalIndex = 0

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const ctx = getMeasureCtx()
  if (font) ctx.font = font

  for (let lineIdx = 0; lineIdx < result.lines.length; lineIdx++) {
    const line = result.lines[lineIdx]!
    const y = lineIdx * lineHeight + offsetY
    const lineText = line.text

    // Split the line text into graphemes
    const graphemes = Array.from(segmenter.segment(lineText), s => s.segment)

    // Measure cumulative widths using canvas for accuracy (accounts for kerning)
    let x = offsetX
    let cumText = ''

    for (let gi = 0; gi < graphemes.length; gi++) {
      const char = graphemes[gi]!
      const isWhitespace = /^\s+$/.test(char)

      // Measure width of this character in context
      const prevWidth = ctx.measureText(cumText).width
      cumText += char
      const newWidth = ctx.measureText(cumText).width
      const charWidth = newWidth - prevWidth

      if (!isWhitespace) {
        positions.push({
          char,
          globalIndex,
          x,
          y,
          width: charWidth,
          lineIndex: lineIdx,
          segmentIndex: 0,
        })
      }

      x += charWidth
      globalIndex++
    }
  }

  return positions
}

/**
 * Compute the layout height for centering purposes
 */
export function getLayoutInfo(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  lineHeight: number,
) {
  const result = layoutWithLines(prepared, maxWidth, lineHeight)
  return {
    height: result.height,
    lineCount: result.lineCount,
    lines: result.lines,
  }
}
