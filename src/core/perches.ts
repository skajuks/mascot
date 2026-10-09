// Perches: small extra copies of the mascot that live on elements you choose, at the size you choose.
// Each perch has its feet on one edge of its element: standing on the top, hanging upside down from
// the bottom, or clinging sideways to the left or right. Everything is drawn on one fixed canvas, and
// each perch is clipped to the outside of its edge, so the element itself hides whatever is "behind"
// it: that's how a peeker can duck down without any z-index tricks on the host page.
//
// Perches glance at a nearby cursor, sometimes say hi, and hop when clicked.

import { defineCharacter, isCharacter, type Character, type CharacterDef, type State } from './character.js'
import { pickLine, splitAttr, type Lines } from './lines.js'
import { Particles } from './particles.js'
import { drawCharacter } from './render.js'

export type PerchEdge = 'top' | 'bottom' | 'left' | 'right'
export type PerchAct = 'idle' | 'wander' | 'peek' | 'sleep' | 'dance'
export type PerchSize = 'xs' | 'sm' | 'md' | 'lg'

export type PerchOptions = {
  /** Which edge of the element the feet are on. Default 'top'. */
  edge?: PerchEdge
  /** Where along the edge, 0..1 (left to right, or top to bottom on the sides). Default 0.5. */
  at?: number
  /** xs, sm, md, lg (1-4 px per pixel), or any number of px per pixel. Default 'sm'. */
  size?: PerchSize | number
  /** What it does there. Default 'idle'. */
  act?: PerchAct
  /** Another character for this perch. Default: whatever the main mascot is. */
  character?: Character | CharacterDef
  /** An emote to hold (layers with frames of that name swap to them). */
  emote?: string
  /** Said when clicked, and sometimes when the cursor comes close. */
  say?: Lines
}

export type Perch = {
  readonly el: Element
  /** Change any options; the rest are kept. */
  update(options: PerchOptions): void
  say(text: string, ms?: number): void
  hop(): void
  remove(): void
}

export type PerchHost = {
  character(): Character
  /** Fallback lines when a perch has none of its own. */
  lines(): Lines
  zIndex: number
  reduced: boolean
  onPoke(el: Element, count: number): void
  /** Element to read --mascot-bubble-* theme values from. */
  themeEl: Element
}

const SIZES: Record<PerchSize, number> = { xs: 1, sm: 2, md: 3, lg: 4 }
const ANGLE: Record<PerchEdge, number> = { top: 0, right: Math.PI / 2, bottom: Math.PI, left: -Math.PI / 2 }
const EDGES = new Set<string>(['top', 'bottom', 'left', 'right'])
const ACTS = new Set<string>(['idle', 'wander', 'peek', 'sleep', 'dance'])

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const defined = new WeakMap<CharacterDef, Character>()
const resolve = (c: Character | CharacterDef): Character => {
  if (isCharacter(c)) return c
  let out = defined.get(c)
  if (!out) defined.set(c, (out = defineCharacter(c)))
  return out
}

/**
 * Reads `data-mascot-perch`: space-separated words, perches separated by `;`.
 * Edge (top, bottom, left, right), size (xs, sm, md, lg, or 3x), act (idle, wander, peek, sleep,
 * dance), position (30%), and any other word is an emote. Example: "right 30% sm peek; top 80% xs sleep".
 */
export function parsePerchAttr(value: string): PerchOptions[] {
  return value
    .split(';')
    .map(group => group.trim())
    .filter(Boolean)
    .map(group => {
      const o: PerchOptions = {}
      for (const word of group.toLowerCase().split(/\s+/)) {
        if (EDGES.has(word)) o.edge = word as PerchEdge
        else if (ACTS.has(word)) o.act = word as PerchAct
        else if (word in SIZES) o.size = word as PerchSize
        else if (/^\d+(\.\d+)?x$/.test(word)) o.size = parseFloat(word)
        else if (/^\d+(\.\d+)?%$/.test(word)) o.at = parseFloat(word) / 100
        else o.emote = word
      }
      return o
    })
}

type Live = {
  el: Element
  opts: PerchOptions
  pokes: number
  phase: number
  // Wandering along the edge: offset from home, where it's heading, how long it waits.
  wx: number
  target: number
  wait: number
  dir: number
  jump: number
  jumpH: number
  bubble: { text: string; until: number } | null
  greeted: boolean
  blinkAt: number
}

export function createPerchLayer(host: PerchHost) {
  const canvas = document.createElement('canvas')
  canvas.className = 'mascot-perches'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.zIndex = String(host.zIndex - 2)
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')!
  const fx = new Particles(host.character().fx)
  const perches = new Set<Live>()
  const fromAttr = new Map<Element, { value: string; list: Perch[] }>()
  const pointer = { x: -999, y: -999 }

  let w = 0
  let h = 0
  let dpr = 1
  const size = () => {
    dpr = Math.min(2, devicePixelRatio || 1)
    w = document.documentElement.clientWidth
    h = innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  size()

  const theme = { bg: '#141412', fg: '#ecebe3', font: 'monospace' }
  const readTheme = () => {
    const css = getComputedStyle(host.themeEl)
    theme.bg = css.getPropertyValue('--mascot-bubble-bg').trim() || '#141412'
    theme.fg = css.getPropertyValue('--mascot-bubble-fg').trim() || '#ecebe3'
    theme.font = css.getPropertyValue('--mascot-bubble-font').trim() || 'ui-monospace, monospace'
  }
  readTheme()

  /** The edge's frame in viewport space: origin, rotation, length. Local +x runs along the edge, local -y points out. */
  const frameOf = (p: Live) => {
    const r = p.el.getBoundingClientRect()
    const edge = p.opts.edge ?? 'top'
    const at = Math.min(1, Math.max(0, p.opts.at ?? 0.5))
    const horizontal = edge === 'top' || edge === 'bottom'
    const len = horizontal ? r.width : r.height
    // Origins are picked so `at` always reads left-to-right / top-to-bottom on the page.
    const origin =
      edge === 'top' ? [r.left, r.top] : edge === 'right' ? [r.right, r.top] : edge === 'bottom' ? [r.right, r.bottom] : [r.left, r.bottom]
    const along = edge === 'top' || edge === 'right' ? at * len : (1 - at) * len
    return { r, ox: Math.round(origin[0]), oy: Math.round(origin[1]), angle: ANGLE[edge], len, along }
  }

  const scaleOf = (p: Live) => {
    const s = p.opts.size ?? 'sm'
    return typeof s === 'number' ? Math.max(1, Math.round(s)) : SIZES[s]
  }

  /** Where along the edge the perch lives, kept far enough from the corners for its width. */
  const placeOf = (f: ReturnType<typeof frameOf>, char: Character, S: number) => {
    const half = (char.width * S) / 2
    const lo = Math.min(half + 4, f.len / 2)
    const hi = Math.max(f.len - half - 4, f.len / 2)
    return { lo, hi, home: Math.min(hi, Math.max(lo, f.along)) }
  }

  const toLocal = (angle: number, dx: number, dy: number) => [dx * Math.cos(-angle) - dy * Math.sin(-angle), dx * Math.sin(-angle) + dy * Math.cos(-angle)]
  const toScreen = (f: ReturnType<typeof frameOf>, lx: number, ly: number) => [f.ox + lx * Math.cos(f.angle) - ly * Math.sin(f.angle), f.oy + lx * Math.sin(f.angle) + ly * Math.cos(f.angle)]

  const linesOf = (p: Live) => p.opts.say ?? host.lines()
  const speak = (p: Live, text: string | null, ms: number, now: number) => {
    if (text) p.bubble = { text, until: now + ms }
  }

  const drawZ = (x: number, y: number, s: number) => {
    ctx.fillRect(x, y, 3 * s, s)
    ctx.fillRect(x + s, y + s, s, s)
    ctx.fillRect(x, y + 2 * s, 3 * s, s)
  }

  const drawBubble = (text: string, x: number, y: number) => {
    ctx.font = `12px ${theme.font}`
    const tw = Math.ceil(ctx.measureText(text).width)
    const bw = tw + 14
    const bx = Math.round(Math.min(w - bw - 4, Math.max(4, x - bw / 2)))
    const by = Math.round(Math.max(4, y - 26))
    ctx.fillStyle = 'rgba(0,0,0,0.85)'
    ctx.fillRect(bx + 2, by + 2, bw, 19)
    ctx.fillStyle = theme.bg
    ctx.fillRect(bx, by, bw, 19)
    ctx.fillRect(Math.round(x) - 2, by + 19, 4, 3)
    ctx.fillStyle = theme.fg
    ctx.textBaseline = 'middle'
    ctx.fillText(text, bx + 7, by + 10)
  }

  const step = (p: Live, dt: number, lo: number, hi: number, home: number) => {
    if (p.jump > 0) p.jump = Math.max(0, p.jump - dt)
    if (p.opts.act !== 'wander' || host.reduced) return false
    if (p.wait > 0) {
      p.wait -= dt
      if (p.wait <= 0) {
        p.target = rand(lo - home, hi - home)
        if (Math.random() < 0.25) {
          p.jump = 0.5
          p.jumpH = rand(14, 30)
        }
      }
      return false
    }
    const dx = p.target - p.wx
    if (Math.abs(dx) < 1) {
      p.wait = rand(0.8, 4)
      return false
    }
    p.dir = Math.sign(dx)
    p.wx += p.dir * Math.min(Math.abs(dx), 12 * scaleOf(p) * dt)
    return true
  }

  const drawPerch = (p: Live, now: number, dt: number) => {
    if (!p.el.isConnected) return
    const f = frameOf(p)
    if (f.len === 0 || f.r.bottom < -200 || f.r.top > h + 200 || f.r.right < -200 || f.r.left > w + 200) return
    const char = resolve(p.opts.character ?? host.character())
    const S = scaleOf(p)
    const { lo, hi, home } = placeOf(f, char, S)
    const walking = step(p, dt, lo, hi, home)
    const t = host.reduced ? 0 : now / 1000 + p.phase
    const lx = Math.round(home + p.wx)

    // How far the feet sink past the edge (peeking ducks most of the body behind the element).
    const act = p.opts.act ?? 'idle'
    let sink = 0
    let state: State = walking ? 'walk' : 'idle'
    let sway = 0
    if (act === 'peek') {
      const k = host.reduced ? 0.3 : (Math.sin(t * 0.8) + 1) / 2
      sink = S * Math.round(char.feet * (0.3 + 0.75 * k))
    } else if (act === 'sleep') {
      state = 'sleep'
    } else if (act === 'dance' && !host.reduced) {
      const beat = Math.floor(t * 4)
      state = 'walk'
      sink = beat % 2 ? -S : 0
      sway = beat % 4 < 2 ? -S : S
    }
    const jumpY = p.jump > 0 ? -Math.sin((1 - p.jump / 0.5) * Math.PI) * p.jumpH : 0
    if (p.jump > 0) state = 'air'

    // Head point on screen, for glances, greetings and bubbles.
    const [hx, hy] = toScreen(f, lx, -char.feet * S + sink + jumpY)
    const near = Math.hypot(pointer.x - hx, pointer.y - hy) < 60 + 14 * S
    if (near && !p.greeted) {
      p.greeted = true
      if (!p.bubble && Math.random() < 0.5) speak(p, pickLine(linesOf(p)), 1400, now)
    }
    if (!near) p.greeted = false

    // Look in the character's own frame: rotate the pointer offset into the edge's frame.
    let look: [number, number] = [walking ? p.dir : 0, 0]
    if (near && state !== 'sleep') {
      const [dx, dy] = toLocal(f.angle, pointer.x - hx, pointer.y - hy)
      look = [Math.abs(dx) > 8 ? Math.sign(dx) : 0, dy < -12 ? -1 : dy > 12 ? 1 : 0]
    }
    if (now > p.blinkAt + 130) p.blinkAt = now + rand(2000, 5500)
    const blinking = now > p.blinkAt && now < p.blinkAt + 130

    ctx.save()
    ctx.translate(f.ox, f.oy)
    ctx.rotate(f.angle)
    ctx.beginPath()
    ctx.rect(-1e5, -1e5, 2e5, 1e5) // the outside of the edge
    ctx.clip()
    drawCharacter(ctx, char, lx + sway, sink + Math.round(jumpY), S, {
      state,
      emote: p.opts.emote ?? null,
      blinking,
      look,
      t: now,
      flip: char.flip && p.dir < 0,
    })
    ctx.restore()

    if (act === 'sleep' && !host.reduced) {
      ctx.fillStyle = theme.bg === 'transparent' ? theme.fg : theme.bg
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.5 + i / 3) % 1
        ctx.globalAlpha = 1 - k
        drawZ(Math.round(hx + 3 * S + k * 12), Math.round(hy - 4 * S - k * 26), Math.max(2, S))
      }
      ctx.globalAlpha = 1
    }
    if (p.bubble && now < p.bubble.until) drawBubble(p.bubble.text, hx, hy - 2)
    else p.bubble = null
  }

  let raf = 0
  let last = performance.now()
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, w, h)
    for (const p of perches) drawPerch(p, now, dt)
    fx.update(dt)
    fx.draw(ctx, scrollX, scrollY)
  }
  raf = requestAnimationFrame(frame)

  const onMove = (e: PointerEvent) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
  }
  // Clicking a perch (whatever part of it shows) makes it hop and say something.
  const onDown = (e: PointerEvent) => {
    const now = performance.now()
    for (const p of perches) {
      if (!p.el.isConnected) continue
      const f = frameOf(p)
      const char = resolve(p.opts.character ?? host.character())
      const S = scaleOf(p)
      const [lx, ly] = toLocal(f.angle, e.clientX - f.ox, e.clientY - f.oy)
      const x = placeOf(f, char, S).home + p.wx
      if (Math.abs(lx - x) > (char.width * S) / 2 + 4 || ly > 2 || ly < -char.height * S - 4) continue
      hopPerch(p)
      speak(p, pickLine(linesOf(p), { count: p.pokes, el: p.el }), 1300, now)
      const [sx, sy] = toScreen(f, x, -(char.feet * S) / 2)
      fx.colors = char.fx
      fx.sparks(sx + scrollX, sy + scrollY, 8 + S * 2)
      host.onPoke(p.el, p.pokes)
    }
  }
  const hopPerch = (p: Live) => {
    p.pokes++
    if (host.reduced) return
    p.jump = 0.5
    p.jumpH = rand(16, 28)
  }

  window.addEventListener('resize', size)
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerdown', onDown, { passive: true })

  const add = (el: Element, options: PerchOptions = {}): Perch => {
    const p: Live = {
      el,
      opts: { ...options },
      pokes: 0,
      phase: rand(0, 20),
      wx: 0,
      target: 0,
      wait: rand(0.5, 3),
      dir: Math.random() < 0.5 ? -1 : 1,
      jump: 0,
      jumpH: 0,
      bubble: null,
      greeted: false,
      blinkAt: performance.now() + rand(500, 4000),
    }
    perches.add(p)
    readTheme()
    return {
      el,
      update: o => {
        if (o.act !== undefined && o.act !== p.opts.act) p.wx = p.target = 0
        Object.assign(p.opts, o)
      },
      say: (text, ms = 2000) => speak(p, text, ms, performance.now()),
      hop: () => hopPerch(p),
      remove: () => perches.delete(p),
    }
  }

  /** Brings data-mascot-perch elements in line with the page: new ones get perches, removed ones lose them. */
  const sync = () => {
    const seen = new Set<Element>()
    for (const el of document.querySelectorAll('[data-mascot-perch]')) {
      seen.add(el)
      const value = el.getAttribute('data-mascot-perch') ?? ''
      const say = el.hasAttribute('data-mascot-perch-say') ? splitAttr(el.getAttribute('data-mascot-perch-say')) : undefined
      const key = `${value}|${say?.join('|') ?? ''}`
      if (fromAttr.get(el)?.value === key) continue
      fromAttr.get(el)?.list.forEach(p => p.remove())
      fromAttr.set(el, { value: key, list: parsePerchAttr(value).map(o => add(el, { ...o, say })) })
    }
    for (const [el, entry] of fromAttr) {
      if (seen.has(el)) continue
      entry.list.forEach(p => p.remove())
      fromAttr.delete(el)
    }
  }

  return {
    add,
    sync,
    get count() {
      return perches.size
    },
    destroy: () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', size)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      canvas.remove()
      perches.clear()
    },
    setHidden: (hidden: boolean) => {
      canvas.hidden = hidden
    },
  }
}

export type PerchLayer = ReturnType<typeof createPerchLayer>
