// Renders characters. The live mascot is one SVG built once: every frame of every layer is a <g>,
// and switching poses only toggles `display`, so the animation loop never rebuilds markup.
// `drawCharacter` paints the same character on a canvas, for your own scenes and games.

import { frameAt, offsetFor, poseKey, type Character, type ResolvedFrame, type State } from './character.js'

const SVG = 'http://www.w3.org/2000/svg'

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const node = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

/** Appends one <rect> per horizontal run of same-colored pixels. */
export function matrixRects(parent: Element, rows: readonly string[], palette: Record<string, string>) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x]
      let n = 1
      while (row[x + n] === ch) n++
      const fill = palette[ch]
      if (fill) parent.append(el('rect', { x, y, width: n, height: 1, fill }))
      x += n
    }
  })
}

/** A standalone crisp SVG for a matrix, `size` CSS px per pixel. */
export function matrixSvg(rows: readonly string[], palette: Record<string, string>, size: number): SVGSVGElement {
  const w = Math.max(0, ...rows.map(r => r.length))
  const h = rows.length
  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w * size, height: h * size, 'shape-rendering': 'crispEdges', 'aria-hidden': 'true' })
  matrixRects(svg, rows, palette)
  return svg
}

function frameNode(frame: ResolvedFrame, palette: Record<string, string>) {
  const g = el('g', { display: 'none' })
  if (frame.kind === 'matrix') matrixRects(g, frame.rows, palette)
  else g.append(el('image', { href: frame.src, width: frame.width, height: frame.height, style: 'image-rendering:pixelated' }))
  return g
}

export type Pose = {
  state: State
  emote: string | null
  blinking: boolean
  /** Gaze, each axis -1..1. */
  look: readonly [number, number]
  /** Animation time in ms, for animated layers. */
  t: number
}

export type Sprite = {
  svg: SVGSVGElement
  /** Shows the right frame of every layer. Cheap to call every animation frame: only changes touch the DOM. */
  update(pose: Pose): void
}

export function createSprite(char: Character, scale: number): Sprite {
  const svg = el('svg', {
    viewBox: `0 0 ${char.width} ${char.height}`,
    width: char.width * scale,
    height: char.height * scale,
    'shape-rendering': 'crispEdges',
    'aria-hidden': 'true',
    class: 'mascot-sprite',
  })
  svg.style.overflow = 'visible'
  const whole = el('g', {})
  svg.append(whole)

  // Each frame set becomes a run of hidden groups; a layer shows at most one of them at a time.
  const layers = char.layers.map(layer => {
    const g = el('g', { 'data-layer': layer.name })
    whole.append(g)
    const nodes = new Map<string, Element[]>()
    for (const [key, set] of layer.sets) {
      if (!set) continue
      nodes.set(
        key,
        set.frames.map(f => {
          const node = frameNode(f, char.palette)
          node.setAttribute('transform', `translate(${layer.at[0]} ${layer.at[1]})`)
          g.append(node)
          return node
        }),
      )
    }
    return { layer, g, nodes, shown: null as Element | null, shift: '' }
  })

  let wholeShift = ''
  return {
    svg,
    update({ state, emote, blinking, look, t }) {
      const [wx, wy] = offsetFor(char.offsets, state, emote)
      const ws = `translate(${wx} ${wy})`
      if (ws !== wholeShift) whole.setAttribute('transform', (wholeShift = ws))

      for (const l of layers) {
        const key = poseKey(l.layer, state, emote, blinking)
        const set = key ? l.layer.sets.get(key) : null
        const next = set ? (l.nodes.get(key!)?.[frameAt(set, t)] ?? null) : null
        if (next !== l.shown) {
          l.shown?.setAttribute('display', 'none')
          next?.removeAttribute('display')
          l.shown = next
        }
        const [ox, oy] = offsetFor(l.layer.offsets, state, emote)
        const shift = `translate(${ox + look[0] * l.layer.look} ${oy + look[1] * l.layer.look})`
        if (shift !== l.shift) l.g.setAttribute('transform', (l.shift = shift))
      }
    },
  }
}

const images = new Map<string, HTMLImageElement>()
function cachedImage(src: string) {
  let img = images.get(src)
  if (!img) {
    img = new Image()
    img.src = src
    images.set(src, img)
  }
  return img
}

export type DrawOptions = Partial<Pose> & {
  /** Mirror horizontally (facing left). */
  flip?: boolean
}

/**
 * Draws a character on a canvas with its feet centered at (x, y), `scale` px per grid pixel.
 * Image frames draw once they've loaded.
 */
export function drawCharacter(ctx: CanvasRenderingContext2D, char: Character, x: number, y: number, scale: number, opts: DrawOptions = {}) {
  const { state = 'idle', emote = null, blinking = false, look = [0, 0], t = 0, flip = false } = opts
  const [wx, wy] = offsetFor(char.offsets, state, emote)
  const left = Math.round(x - (char.width * scale) / 2)
  const top = Math.round(y - char.feet * scale)

  ctx.save()
  if (flip) {
    ctx.translate(left * 2 + char.width * scale, 0)
    ctx.scale(-1, 1)
  }
  for (const layer of char.layers) {
    const key = poseKey(layer, state, emote, blinking)
    const set = key ? layer.sets.get(key) : null
    if (!set) continue
    const frame = set.frames[frameAt(set, t)]
    const [ox, oy] = offsetFor(layer.offsets, state, emote)
    const gx = left + (layer.at[0] + wx + ox + look[0] * layer.look) * scale
    const gy = top + (layer.at[1] + wy + oy + look[1] * layer.look) * scale
    if (frame.kind === 'image') {
      const img = cachedImage(frame.src)
      if (img.complete && img.naturalWidth) ctx.drawImage(img, gx, gy, frame.width * scale, frame.height * scale)
      continue
    }
    frame.rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const c = char.palette[row[rx]]
        if (!c) continue
        ctx.fillStyle = c
        ctx.fillRect(gx + rx * scale, gy + ry * scale, scale, scale)
      }
    })
  }
  ctx.restore()
}

/** Pixel chars handed out to colors by `matrixFromImage`, in order ('.' stays transparent). */
const KEYS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * Converts pixel art (one image pixel per grid pixel) into a matrix and palette.
 * Transparent pixels become '.'. Use it to bring in sprites drawn in Aseprite, Piskel, etc.
 */
export function matrixFromImage(img: CanvasImageSource & { width: number; height: number }): { rows: string[]; palette: Record<string, string> } {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, img.width, img.height)
  const keyOf = new Map<string, string>()
  const rows: string[] = []
  for (let y = 0; y < img.height; y++) {
    let row = ''
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      if (data[i + 3] < 128) {
        row += '.'
        continue
      }
      const hex = '#' + [data[i], data[i + 1], data[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')
      let key = keyOf.get(hex)
      if (!key) {
        key = KEYS[keyOf.size]
        if (!key) throw new Error(`mascot: image has more than ${KEYS.length} colors`)
        keyOf.set(hex, key)
      }
      row += key
    }
    rows.push(row)
  }
  const palette: Record<string, string> = {}
  for (const [hex, key] of keyOf) palette[key] = hex
  return { rows, palette }
}
