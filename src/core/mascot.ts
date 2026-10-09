// The mascot engine. It walks on "spots": elements marked with data-mascot-spot (or attached with
// `mascot.attach(el, { spot: true })`). It stands on a spot's top edge, trots after the cursor along
// it, hops to whichever spot is near the reading line as you scroll, and talks: on hover, when a
// section scrolls into view, on click, and now and then on its own. Visitors can poke it, drag and
// throw it, and play fetch with a ball. It naps when nothing happens.
//
// Everything runs in one requestAnimationFrame loop that writes transforms and data attributes
// straight to the DOM, so it costs nothing to the host framework.

import { defineCharacter, isCharacter, type Character, type CharacterDef, type State } from './character.js'
import { createEmitter } from './emitter.js'
import { asList, DEFAULT_LINES, pickLine, splitAttr, type LineBook, type Lines } from './lines.js'
import { Particles } from './particles.js'
import { capSpeed, collectSurfaces, screenFloor, stepBody, topOf, type Body, type Surface } from './physics.js'
import { createSprite, matrixSvg, type Sprite } from './render.js'
import { injectStyles } from './styles.js'
import { pix } from '../characters/pix.js'

// ---------------------------------------------------------------------------------------------
// Public types

export type Features = {
  /** Trot after the mouse cursor along the current spot. */
  follow: boolean
  /** Hop to the spot nearest the reading line while scrolling. Off: stays put unless sent with `goTo`. */
  roam: boolean
  /** Visitors can pick the mascot up and throw it. */
  drag: boolean
  /** Speak element lines (hover, scroll into view, click) and its own chatter. */
  talk: boolean
  /** Doze off after a while without input. */
  sleep: boolean
  /** Blink now and then (needs a `blink` frame in the character). */
  blink: boolean
  /** Dust, trails and sparks on a canvas over the page. */
  particles: boolean
  /** A ball to throw; the mascot fetches it back to the cursor. */
  ball: boolean
}

export type MenuItem = {
  label: string
  onSelect: (mascot: Mascot) => void
}

/** Per-element behavior, from `mascot.attach(el, config)` or data-mascot-* attributes. */
export type ElementConfig = {
  /** The mascot can stand on this element's top edge. `'home'` is where it first appears. */
  spot?: boolean | 'home'
  /** Said on hover. Attribute: data-mascot-say="one|two". */
  say?: Lines
  /** Said once, the first time the element scrolls into view. Attribute: data-mascot-enter. */
  enter?: Lines
  /** Said when the element is clicked. Attribute: data-mascot-click. */
  click?: Lines
  /** Said now and then while standing on this spot. Attribute: data-mascot-chatter. */
  chatter?: Lines
}

export type MascotOptions = {
  /** The character to show. Default: Pix, the TV-headed robot. */
  character?: Character | CharacterDef
  /** CSS px per grid pixel. Default: the character's own scale (4 for Pix). */
  scale?: number
  /** Override any of the mascot's own lines. */
  lines?: Partial<LineBook>
  /** Name used in the accessible label. Default: the character's name. */
  name?: string
  /** Where spots come from. Default '[data-mascot-spot]'. */
  spots?: string
  /** Space at the top of the viewport the mascot stays out of, e.g. a fixed header's height. */
  ceiling?: number
  zIndex?: number
  /** ms without input before it naps. */
  sleepAfter?: number
  /** ms between chatter lines while the visitor is active. */
  chatterEvery?: number
  /** ms after mount before it drops in. */
  startDelay?: number
  features?: Partial<Features>
  /** Clicking the mascot opens this menu instead of poking it. Wire your own features in here. */
  menu?: MenuItem[]
  /** Heading shown above the menu. */
  menuTitle?: string
  /** Forces reduced motion on or off. Default: the visitor's OS setting. */
  reducedMotion?: boolean
  plugins?: MascotPlugin[]
}

export type MascotEvents = {
  ready: { spot: Element }
  say: { text: string }
  poke: { count: number }
  grab: { count: number }
  throw: { speed: number }
  land: { count: number }
  sleep: Record<string, never>
  wake: { after: number }
  spot: { el: Element | null }
  hover: { el: Element }
  enter: { el: Element }
  click: { el: Element }
  fetch: { count: number }
  state: { state: State }
  menu: { open: boolean }
}

export type PluginKit = {
  /** Particle system in document coordinates, or null with reduced motion. */
  fx: Particles | null
  /** Surfaces near the viewport. */
  surfaces: () => Surface[]
}
export type PluginHooks = { frame?: (dt: number, now: number) => void; destroy?: () => void }
export type MascotPlugin = (mascot: Mascot, kit: PluginKit) => PluginHooks | void

export type Mascot = {
  /** The mascot's root element. */
  readonly el: HTMLElement
  readonly character: Character
  readonly state: State
  /** Feet position in document coordinates. */
  readonly position: { x: number; y: number }
  /** Say something. `ms: Infinity` keeps it up until the next line. */
  say(text: string, ms?: number): void
  /** Say a random line from a list. */
  sayOne(lines: Lines, ms?: number): void
  hush(): void
  hop(): void
  /** Walk over to an element (or a selector) and stay near it for `ms`. */
  goTo(target: Element | string, ms?: number): void
  /** Show an emote: layers with frames named `name` swap to them; `data-emote` is set for CSS. */
  emote(name: string | null, ms?: number): void
  sleep(): void
  wake(): void
  /** Send the mascot after the ball (needs the ball feature). */
  fetch(): void
  openMenu(): void
  closeMenu(): void
  /** Give an element mascot behavior without data attributes. Returns the undo function. */
  attach(el: Element, config: ElementConfig): () => void
  on<K extends keyof MascotEvents>(type: K, fn: (e: MascotEvents[K]) => void): () => void
  setCharacter(character: Character | CharacterDef, scale?: number): void
  setLines(lines: Partial<LineBook>): void
  setMenu(items: MenuItem[] | undefined, title?: string): void
  setFeatures(features: Partial<Features>): void
  show(): void
  hide(): void
  destroy(): void
}

// ---------------------------------------------------------------------------------------------

const DEFAULT_FEATURES: Features = {
  follow: true,
  roam: true,
  drag: true,
  talk: true,
  sleep: true,
  blink: true,
  particles: true,
  ball: false,
}

const DRAG_START = 6
const BALL_HALF = 8
const BALL = ['..kkkk..', '.kwwwwk.', 'kwwwwrrk', 'kwwwrrwk', 'kwwrrwwk', 'kwrrwwgk', '.kwwggk.', '..kkkk..']
const BALL_COLORS = { k: '#5d5e58', w: '#ecebe3', r: '#ff5a4f', g: '#a4a39b' }
const ATTRS = { say: 'data-mascot-say', enter: 'data-mascot-enter', click: 'data-mascot-click', chatter: 'data-mascot-chatter' } as const

type Vec = { x: number; y: number }
type Hop = { from: Vec; to: Vec; t0: number; dur: number; arc: number }
type Mode = 'free' | 'held' | 'flying' | 'dizzy' | 'chase' | 'carry'
type Sample = { x: number; y: number; t: number }
type Grab = { x: number; y: number; dragging: boolean; samples: Sample[] }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Velocity from the last ~100 ms of pointer samples. */
function velocity(samples: Sample[]): Vec {
  if (samples.length < 2) return { x: 0, y: 0 }
  const a = samples[0]
  const b = samples[samples.length - 1]
  const dt = Math.max(16, b.t - a.t) / 1000
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt }
}

function pushSample(samples: Sample[], x: number, y: number) {
  const t = performance.now()
  samples.push({ x, y, t })
  while (samples.length > 2 && t - samples[0].t > 100) samples.shift()
}

export function createMascot(options: MascotOptions = {}): Mascot {
  injectStyles()
  const opts = {
    spots: '[data-mascot-spot]',
    ceiling: 0,
    zIndex: 40,
    sleepAfter: 15_000,
    chatterEvery: 25_000,
    startDelay: 700,
    ...options,
  }
  const features: Features = { ...DEFAULT_FEATURES, ...options.features }
  let siteLines = options.lines
  let lines = DEFAULT_LINES
  let menu = options.menu
  let menuTitle = options.menuTitle
  const reduced = options.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches
  const events = createEmitter<MascotEvents>()
  const registry = new Map<Element, ElementConfig>()

  // --- DOM ---------------------------------------------------------------------------------
  let char!: Character
  let scale = 4
  let W = 0
  let FEET = 0
  let sprite!: Sprite

  const root = document.createElement('div')
  root.className = 'mascot'
  root.dataset.state = 'idle'
  root.style.zIndex = String(opts.zIndex)
  root.style.transform = 'translate3d(-200px,-200px,0)'
  if (reduced) root.dataset.still = ''
  const live = document.createElement('div')
  live.className = 'mascot-sr'
  live.setAttribute('role', 'status')
  live.setAttribute('aria-live', 'polite')
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'mascot-body'
  root.append(live, button)

  const fxCanvas = document.createElement('canvas')
  fxCanvas.className = 'mascot-fx'
  fxCanvas.setAttribute('aria-hidden', 'true')
  fxCanvas.style.zIndex = String(opts.zIndex - 1)
  const fxCtx = fxCanvas.getContext('2d')!

  const ballEl = document.createElement('div')
  ballEl.className = 'mascot-ball'
  ballEl.setAttribute('role', 'button')
  ballEl.style.zIndex = String(opts.zIndex)
  ballEl.style.transform = 'translate3d(-200px,-200px,0)'
  ballEl.append(matrixSvg(BALL, BALL_COLORS, 2))

  document.body.append(fxCanvas, ballEl, root)

  let fx: Particles | null = null
  const label = () => {
    const name = options.name ?? char.name
    const what = menu?.length ? 'Click for a menu' : 'Poke it'
    button.setAttribute('aria-label', `${name}, the site mascot. ${what}${features.drag ? ', or drag and throw it' : ''}.`)
    ballEl.setAttribute('aria-label', `A ball. Throw it and ${name} will fetch it.`)
  }
  const applyCharacter = (c: Character | CharacterDef, sc?: number) => {
    char = isCharacter(c) ? c : defineCharacter(c)
    scale = sc ?? options.scale ?? char.scale
    W = char.width * scale
    FEET = char.feet * scale
    sprite?.svg.remove()
    sprite = createSprite(char, scale)
    button.append(sprite.svg)
    root.style.width = `${W}px`
    root.style.height = `${char.height * scale}px`
    root.style.setProperty('--mascot-px', `${scale}px`)
    if (fx) fx.colors = char.fx
    lines = { ...DEFAULT_LINES, ...char.lines, ...siteLines }
    label()
  }
  applyCharacter(options.character ?? pix)

  let fxDpr = 1
  let fxWasActive = false
  const sizeFx = () => {
    fxDpr = Math.min(2, devicePixelRatio || 1)
    fxCanvas.width = Math.round(innerWidth * fxDpr)
    fxCanvas.height = Math.round(innerHeight * fxDpr)
  }
  const applyFeatures = () => {
    fx = features.particles && !reduced ? (fx ?? new Particles(char.fx)) : null
    if (!fx) fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height)
    ballEl.hidden = !features.ball || !ball.placed
    label()
  }

  // --- state -------------------------------------------------------------------------------
  const s = {
    pos: { x: -200, y: -200 } as Vec,
    hop: null as Hop | null,
    spot: null as Element | null,
    focus: null as { el: Element; until: number } | null,
    pointer: { x: -1, y: -1, movedAt: 0 },
    desiredX: null as number | null,
    lastActive: performance.now(),
    sleeping: false,
    sleptAt: 0,
    pokes: 0,
    grabs: 0,
    landings: 0,
    lastSayAt: 0,
    lastHover: null as Element | null,
    state: 'idle' as State,
    emote: null as string | null,
    blinking: false,
    look: [0, 0] as [number, number],
    edge: '',
    started: false,
    mode: 'free' as Mode,
    modeAt: 0,
    body: null as Body | null,
    grab: null as Grab | null,
    fetches: 0,
    facing: 1,
    hidden: false,
    menuOpen: false,
  }
  const ball = {
    body: { x: -200, y: -200, vx: 0, vy: 0, half: BALL_HALF, on: null } as Body,
    held: 'none' as 'none' | 'pointer' | 'mascot',
    grab: null as Grab | null,
    rot: 0,
    placed: false,
  }
  applyFeatures()

  // --- element config ----------------------------------------------------------------------
  const configOf = (el: Element): ElementConfig => {
    const reg = registry.get(el)
    const attr = (k: keyof typeof ATTRS) => (el.hasAttribute(ATTRS[k]) ? splitAttr(el.getAttribute(ATTRS[k])) : undefined)
    return {
      spot: reg?.spot ?? (el.matches(opts.spots) ? (el.getAttribute('data-mascot-spot') === 'home' ? 'home' : true) : false),
      say: reg?.say ?? attr('say'),
      enter: reg?.enter ?? attr('enter'),
      click: reg?.click ?? attr('click'),
      chatter: reg?.chatter ?? attr('chatter'),
    }
  }
  /** The nearest element (from `target` up) with lines for `kind`. */
  const findTalker = (target: EventTarget | null, kind: 'say' | 'click'): Element | null => {
    for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
      if (registry.get(el)?.[kind] !== undefined || el.hasAttribute(ATTRS[kind])) return el
    }
    return null
  }
  const spotEls = (): Element[] => {
    const set = new Set(document.querySelectorAll(opts.spots))
    for (const [el, c] of registry) if (c.spot) set.add(el)
    return [...set]
  }
  const homeEl = (): Element | null => {
    for (const [el, c] of registry) if (c.spot === 'home' && el.isConnected) return el
    return document.querySelector(`${opts.spots}[data-mascot-spot="home"]`)
  }

  let surfaces: Surface[] = []
  const refreshSurfaces = () => (surfaces = collectSurfaces(spotEls()))

  /** The spot nearest the reading line (a bit above the middle of the viewport). */
  const pickSpot = (current: Element | null): Element | null => {
    const line = innerHeight * 0.38
    let best: Element | null = null
    let bestD = Infinity
    for (const el of spotEls()) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.top < opts.ceiling + 40 || r.top > innerHeight - 70) continue
      const d = Math.abs(r.top - line) - (el === current ? 40 : 0) // a little stickiness
      if (d < bestD) {
        bestD = d
        best = el
      }
    }
    return best ?? current
  }

  // --- talking -------------------------------------------------------------------------------
  let bubble: HTMLDivElement | null = null
  let sayTimer = 0
  let typeTimer = 0
  const clearBubble = () => {
    clearTimeout(sayTimer)
    clearInterval(typeTimer)
    bubble?.remove()
    bubble = null
  }
  const newBubble = () => {
    clearBubble()
    bubble = document.createElement('div')
    bubble.className = 'mascot-bubble'
    root.insertBefore(bubble, button)
    return bubble
  }
  const speak = (text: string | null, ms = 2600) => {
    if (!text || s.hidden) return
    if (s.menuOpen) closeMenu()
    s.lastSayAt = performance.now()
    const b = newBubble()
    b.setAttribute('aria-hidden', 'true')
    const shown = document.createElement('span')
    const ghost = document.createElement('span')
    ghost.className = 'mascot-ghost' // reserves the full width so the bubble doesn't grow while typing
    b.append(shown, ghost)
    let n = reduced ? text.length : 0
    const type = () => {
      shown.textContent = text.slice(0, n)
      ghost.textContent = text.slice(n)
    }
    type()
    if (n < text.length) {
      typeTimer = window.setInterval(() => {
        n = Math.min(text.length, n + 2)
        type()
        if (n >= text.length) clearInterval(typeTimer)
      }, 28)
    }
    live.textContent = text
    if (Number.isFinite(ms)) sayTimer = window.setTimeout(clearBubble, ms)
    events.emit('say', { text })
  }
  const hush = () => {
    clearBubble()
    s.menuOpen = false
  }
  const line = (key: keyof LineBook, count = 0, el?: Element) => pickLine(lines[key], { count, el })

  // --- menu --------------------------------------------------------------------------------------
  function openMenu() {
    if (!menu?.length || s.hidden) return
    const b = newBubble()
    s.menuOpen = true
    if (menuTitle) {
      const title = document.createElement('div')
      title.className = 'mascot-menu-title'
      title.textContent = menuTitle
      b.append(title)
    }
    const list = document.createElement('div')
    list.className = 'mascot-menu'
    list.setAttribute('role', 'menu')
    for (const item of menu) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.setAttribute('role', 'menuitem')
      btn.textContent = item.label
      btn.addEventListener('click', () => {
        closeMenu()
        item.onSelect(api)
      })
      list.append(btn)
    }
    b.append(list)
    list.querySelector('button')?.focus({ preventScroll: true })
    events.emit('menu', { open: true })
  }
  function closeMenu() {
    if (!s.menuOpen) return
    s.menuOpen = false
    clearBubble()
    events.emit('menu', { open: false })
  }

  // --- motion helpers ------------------------------------------------------------------------
  const setMode = (mode: Mode) => {
    s.mode = mode
    s.modeAt = performance.now()
  }

  const startHop = (to: Vec, now: number, o?: { drop?: boolean; arc?: number }) => {
    if (reduced) {
      s.pos = { ...to }
      s.hop = null
      return
    }
    const from = o?.drop ? { x: to.x, y: scrollY - 80 } : { ...s.pos }
    // Kick off the ground only from a standstill, not when retargeting mid-air.
    if (!o?.drop && !s.hop) fx?.burst(from.x, from.y, 0.6)
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    s.hop = {
      from,
      to,
      t0: now,
      dur: o?.drop ? 520 : clamp(dist * 0.9, 320, 750),
      arc: o?.drop ? 0 : (o?.arc ?? 28 + Math.min(110, dist * 0.18)),
    }
  }

  const activeSpot = (now: number) => {
    if (s.focus && now < s.focus.until && s.focus.el.isConnected) return s.focus.el
    s.focus = null
    return s.spot
  }

  const wake = (now: number) => {
    s.lastActive = now
    if (!s.sleeping) return
    s.sleeping = false
    hush()
    const after = now - s.sleptAt
    events.emit('wake', { after })
    if (after > 1500) speak(line('wake'))
  }

  const startChase = () => {
    if (!features.ball || s.mode === 'held' || s.mode === 'flying' || s.mode === 'dizzy') return
    setMode('chase')
    s.sleeping = false
    speak(line('chase'), 1400)
  }

  /** Where to bring the ball: the surface right under the cursor, or the mascot's current spot. */
  const dropPoint = (now: number): Vec => {
    const px = s.pointer.x + scrollX
    const py = s.pointer.y + scrollY
    const edge = Math.max(14, W * 0.3)
    if (s.pointer.movedAt && now - s.pointer.movedAt < 10_000) {
      let best: Surface | null = null
      for (const sf of [...surfaces, screenFloor()]) {
        if (px < sf.left || px > sf.right || sf.y < py - 12) continue
        if (!best || sf.y < best.y) best = sf
      }
      if (best) return { x: clamp(px, best.left + edge, best.right - edge), y: best.y }
    }
    const spot = activeSpot(now)
    if (spot) {
      const t = topOf(spot)
      return { x: clamp(s.pos.x, t.left + edge, t.right - edge), y: t.y }
    }
    return { ...s.pos }
  }

  function poke(now: number) {
    wake(now)
    if (s.mode !== 'free' && s.mode !== 'chase') return
    if (menu?.length) {
      if (s.menuOpen) closeMenu()
      else openMenu()
      if (!s.hop) startHop({ ...s.pos }, now, { arc: 18 })
      return
    }
    s.pokes++
    fx?.sparks(s.pos.x, s.pos.y - FEET / 2, s.pokes % 10 === 0 ? 28 : 10)
    if (!s.hop) startHop({ ...s.pos }, now, { arc: 22 + Math.min(s.pokes, 8) * 4 })
    speak(line('poke', s.pokes), 1600)
    events.emit('poke', { count: s.pokes })
  }

  function dropBall(dir: number) {
    ball.held = 'none'
    ball.body = { x: s.pos.x + dir * 22, y: s.pos.y - FEET, vx: dir * 90, vy: -260, half: BALL_HALF, on: null }
  }

  // --- input ---------------------------------------------------------------------------------
  const onPointerMove = (e: PointerEvent) => {
    const now = performance.now()
    s.pointer = { x: e.clientX, y: e.clientY, movedAt: now }
    if (e.pointerType === 'mouse') s.desiredX = e.clientX + scrollX
    wake(now)

    const dx = e.clientX + scrollX
    const dy = e.clientY + scrollY
    if (s.grab) {
      if (!s.grab.dragging && features.drag && Math.hypot(e.clientX - s.grab.x, e.clientY - s.grab.y) > DRAG_START) {
        s.grab.dragging = true
        s.hop = null
        if (ball.held === 'mascot') dropBall(0)
        closeMenu()
        setMode('held')
        s.sleeping = false
        speak(line('held', ++s.grabs), 2000)
        events.emit('grab', { count: s.grabs })
      }
      if (s.grab.dragging) {
        s.pos = { x: dx, y: dy + FEET / 2 }
        pushSample(s.grab.samples, dx, dy)
      }
    }
    if (ball.grab) {
      if (!ball.grab.dragging && Math.hypot(e.clientX - ball.grab.x, e.clientY - ball.grab.y) > DRAG_START) ball.grab.dragging = true
      if (ball.grab.dragging) {
        ball.body = { ...ball.body, x: dx, y: dy + BALL_HALF, vx: 0, vy: 0, on: null }
        pushSample(ball.grab.samples, dx, dy)
      }
    }
  }

  const onPointerUp = () => {
    const now = performance.now()
    if (s.grab) {
      const g = s.grab
      s.grab = null
      if (g.dragging) {
        const v = velocity(g.samples)
        s.body = { x: s.pos.x, y: s.pos.y, vx: v.x, vy: v.y, half: W * 0.375, on: null }
        capSpeed(s.body)
        setMode('flying')
        refreshSurfaces()
        const speed = Math.hypot(v.x, v.y)
        if (speed > 500) speak(line('thrown'), 1200)
        events.emit('throw', { speed })
      } else {
        poke(now)
      }
    }
    if (ball.grab) {
      const g = ball.grab
      ball.grab = null
      ball.held = 'none'
      const v = g.dragging ? velocity(g.samples) : { x: (Math.random() - 0.5) * 500, y: -750 }
      Object.assign(ball.body, { vx: v.x, vy: v.y, on: null })
      capSpeed(ball.body)
      refreshSurfaces()
      startChase()
    }
  }

  const onBodyDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    s.grab = { x: e.clientX, y: e.clientY, dragging: false, samples: [] }
  }
  // Keyboard "click" on the button.
  const onBodyClick = (e: MouseEvent) => {
    if (e.detail === 0) poke(performance.now())
  }
  const onBallDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    if (ball.held === 'mascot') setMode('free')
    ball.held = 'pointer'
    ball.grab = { x: e.clientX, y: e.clientY, dragging: false, samples: [] }
  }
  const onBallEnter = () => {
    if (performance.now() - s.lastSayAt > 1500 && s.mode === 'free') speak(line('ball'), 1600)
  }
  const onBallKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    Object.assign(ball.body, { vx: (Math.random() - 0.5) * 500, vy: -750, on: null })
    refreshSurfaces()
    startChase()
  }

  const onPointerOver = (e: PointerEvent) => {
    if (!features.talk) return
    const el = findTalker(e.target, 'say')
    if (!el || el === s.lastHover) return
    s.lastHover = el
    const now = performance.now()
    if (configOf(el).spot) s.focus = { el, until: now + 6000 }
    if (e.pointerType !== 'mouse') s.desiredX = e.clientX + scrollX
    events.emit('hover', { el })
    if (now - s.lastSayAt > 900 && s.mode === 'free' && !s.menuOpen) speak(pickLine(configOf(el).say, { count: 0, el }))
  }
  const onPointerOut = (e: PointerEvent) => {
    const el = findTalker(e.target, 'say')
    const to = findTalker(e.relatedTarget, 'say')
    if (el && el !== to && el === s.lastHover) s.lastHover = null
  }
  const onDocClick = (e: MouseEvent) => {
    if (!features.talk || root.contains(e.target as Node)) return
    const el = findTalker(e.target, 'click')
    if (!el) return
    events.emit('click', { el })
    speak(pickLine(configOf(el).click, { count: 0, el }))
  }
  const onDocDown = (e: PointerEvent) => {
    if (s.menuOpen && !root.contains(e.target as Node)) closeMenu()
  }
  const onKey = (e: KeyboardEvent) => {
    wake(performance.now())
    if (e.key === 'Escape' && s.menuOpen) {
      closeMenu()
      button.focus({ preventScroll: true })
    }
  }

  let spotQueued = false
  const queueSpot = () => {
    if (spotQueued) return
    spotQueued = true
    requestAnimationFrame(() => {
      spotQueued = false
      if (features.roam || !s.spot?.isConnected) {
        const next = pickSpot(s.spot)
        if (next !== s.spot) events.emit('spot', { el: next })
        s.spot = next
      }
      refreshSurfaces()
    })
  }
  const onScroll = () => {
    wake(performance.now())
    queueSpot()
  }
  const onResize = () => {
    sizeFx()
    queueSpot()
  }

  // "Enter" lines: said once when their element scrolls into view; queued if the mascot is busy.
  const entered = new WeakSet<Element>()
  const pendingEnter: Element[] = []
  const io = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entered.has(entry.target)) continue
        entered.add(entry.target)
        io.unobserve(entry.target)
        pendingEnter.push(entry.target)
      }
    },
    { rootMargin: '0px 0px -30% 0px' },
  )
  const observeEnters = () => {
    for (const el of document.querySelectorAll(`[${ATTRS.enter}]`)) if (!entered.has(el)) io.observe(el)
    for (const [el, c] of registry) if (c.enter !== undefined && !entered.has(el)) io.observe(el)
  }
  let mutationQueued = false
  const mo = new MutationObserver(() => {
    if (mutationQueued) return
    mutationQueued = true
    requestAnimationFrame(() => {
      mutationQueued = false
      observeEnters()
      queueSpot()
    })
  })

  sizeFx()
  observeEnters()
  mo.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  document.addEventListener('pointerover', onPointerOver, { passive: true })
  document.addEventListener('pointerout', onPointerOut, { passive: true })
  document.addEventListener('pointerdown', onDocDown, { passive: true })
  document.addEventListener('click', onDocClick)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKey)
  button.addEventListener('pointerdown', onBodyDown)
  button.addEventListener('click', onBodyClick)
  ballEl.addEventListener('pointerdown', onBallDown)
  ballEl.addEventListener('pointerenter', onBallEnter)
  ballEl.addEventListener('keydown', onBallKey)
  ballEl.tabIndex = 0
  const spotInterval = window.setInterval(queueSpot, 500)

  // Blink now and then.
  let blinkTimer = 0
  const blink = () => {
    if (features.blink && char.blinks && !reduced) {
      s.blinking = true
      window.setTimeout(() => (s.blinking = false), 130)
    }
    blinkTimer = window.setTimeout(blink, 2500 + Math.random() * 3500)
  }
  blinkTimer = window.setTimeout(blink, 3000)

  let emoteTimer = 0

  // --- loop ----------------------------------------------------------------------------------
  let raf = 0
  let last = performance.now()
  const startAt = last + opts.startDelay
  let walked = 0
  const hooks: PluginHooks[] = []

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (now < startAt || s.hidden) return

    if (!s.started) {
      s.spot = homeEl() ?? pickSpot(null)
      if (!s.spot) return
      s.started = true
      const t = topOf(s.spot)
      s.pos = { x: t.left + (t.right - t.left) * 0.72, y: t.y }
      s.desiredX = s.pos.x
      startHop({ ...s.pos }, now, { drop: true })
      window.setTimeout(() => speak(line('greet')), 650)
      ball.body = { x: t.left + Math.min(90, (t.right - t.left) * 0.15), y: t.y, vx: 0, vy: 0, half: BALL_HALF, on: { ...t, el: s.spot } }
      ball.placed = true
      ballEl.hidden = !features.ball
      refreshSurfaces()
      events.emit('ready', { spot: s.spot })
    }

    let walking = false
    let dir = 0

    // --- where does it want to be? ---------------------------------------------------------
    let target: Vec | null = null
    let speedBoost = 1
    const edge = Math.max(14, W * 0.3)

    if (s.mode === 'free') {
      const spot = activeSpot(now)
      if (spot) {
        const t = topOf(spot)
        const lo = t.left + edge
        const hi = Math.max(lo, t.right - edge)
        const followMouse = features.follow && now - s.pointer.movedAt < 5000 && s.desiredX !== null
        target = { x: clamp(followMouse ? s.desiredX! : s.pos.x, lo, hi), y: t.y }
      }
    } else if (s.mode === 'chase') {
      // Wait for the ball to settle, then run to it.
      if (ball.held !== 'none' || !features.ball) setMode('free')
      else if (ball.body.on) {
        target = { x: ball.body.x, y: ball.body.on.y }
        speedBoost = 2.4
        if (!s.hop && Math.abs(s.pos.x - ball.body.x) < 18 && Math.abs(s.pos.y - target.y) < 6) {
          ball.held = 'mascot'
          setMode('carry')
          fx?.sparks(s.pos.x, s.pos.y - FEET, 6)
        }
      }
      if (s.mode === 'chase' && now - s.modeAt > 15_000) {
        setMode('free')
        speak(line('giveUp'))
      }
    } else if (s.mode === 'carry') {
      target = dropPoint(now)
      speedBoost = 2
      if (!s.hop && Math.abs(s.pos.x - target.x) < 6 && Math.abs(s.pos.y - target.y) < 6) {
        dropBall(s.facing)
        s.fetches++
        setMode('free')
        speak(line('fetched', s.fetches), 1800)
        events.emit('fetch', { count: s.fetches })
      }
    }

    if (target) {
      if (s.hop) {
        // Retarget mid-air if the landing spot moved (scroll picked another spot, layout shift).
        if (Math.abs(s.hop.to.y - target.y) > 4 || Math.abs(s.hop.to.x - target.x) > 60) {
          if (s.hop.arc > 0) startHop(target, now)
          else s.hop.to = target
        }
      } else if (Math.abs(target.y - s.pos.y) > 3) {
        startHop(target, now, { drop: Math.abs(target.y - s.pos.y) > innerHeight * 1.2 })
      } else {
        s.pos.y = target.y
        const dx = target.x - s.pos.x
        if (Math.abs(dx) > 1.5) {
          const speed = (Math.abs(dx) > 260 ? 340 : 150) * speedBoost
          const step = Math.min(Math.abs(dx), speed * dt)
          s.pos.x += Math.sign(dx) * step
          walked += step
          if (walked > (speed > 200 ? 9 : 16)) {
            walked = 0
            fx?.dust(s.pos.x, s.pos.y, Math.sign(dx))
          }
          walking = true
          dir = Math.sign(dx)
          s.facing = dir
        }
      }
    }

    if (s.hop) {
      const h = s.hop
      const t = clamp((now - h.t0) / h.dur, 0, 1)
      const ty = h.arc > 0 ? t : t * t // drops fall with gravity
      s.pos = {
        x: h.from.x + (h.to.x - h.from.x) * t,
        y: h.from.y + (h.to.y - h.from.y) * ty - h.arc * 4 * t * (1 - t),
      }
      fx?.trail(s.pos.x, s.pos.y - 10)
      if (t >= 1) {
        s.pos = { ...h.to }
        s.hop = null
        fx?.burst(h.to.x, h.to.y, h.arc === 0 ? 1.2 : clamp(h.arc / 80, 0.5, 1.1))
      }
    }

    // --- thrown ------------------------------------------------------------------------------
    if (s.mode === 'flying' && s.body) {
      const ev = stepBody(s.body, dt, surfaces, { bounce: 0.45, friction: 8, ceiling: opts.ceiling })
      s.pos = { x: s.body.x, y: s.body.y }
      fx?.trail(s.pos.x, s.pos.y - FEET / 2)
      if (ev === 'bounce') fx?.burst(s.pos.x, s.pos.y, 0.8)
      if (ev === 'wall') fx?.sparks(s.pos.x, s.pos.y - FEET / 2, 6)
      if (ev === 'land' || (s.body.on && Math.abs(s.body.vx) < 20)) {
        fx?.burst(s.pos.x, s.pos.y, 1.2)
        // Stay on whatever it landed on until the scroll picks a spot.
        if (s.body.on?.el) s.focus = { el: s.body.on.el, until: now + 4000 }
        s.body = null
        setMode('dizzy')
        speak(line('dizzy', ++s.landings), 2200)
        events.emit('land', { count: s.landings })
      }
    } else if (s.mode === 'dizzy' && now - s.modeAt > 1600) {
      setMode('free')
    }

    // --- ball --------------------------------------------------------------------------------
    if (ball.placed && features.ball) {
      if (ball.held === 'mascot') {
        ball.body.x = s.pos.x
        ball.body.y = s.pos.y - FEET + 2
        ball.body.on = null
      } else if (ball.held === 'none') {
        // Keep a resting ball glued to its element if the layout moved.
        if (ball.body.on?.el) Object.assign(ball.body.on, topOf(ball.body.on.el))
        const before = ball.body.x
        const ev = stepBody(ball.body, dt, surfaces, { bounce: 0.55, friction: 1.4, ceiling: opts.ceiling })
        if (ev === 'bounce') fx?.burst(ball.body.x, ball.body.y, 0.35)
        ball.rot += (ball.body.x - before) / BALL_HALF
      }
      const quarter = Math.round(ball.rot / (Math.PI / 2)) * 90
      ballEl.style.transform = `translate3d(${Math.round(ball.body.x - BALL_HALF)}px, ${Math.round(ball.body.y - BALL_HALF * 2)}px, 0) rotate(${quarter}deg)`
    }

    for (const h of hooks) h.frame?.(dt, now)

    if (fx && (fx.active || fxWasActive)) {
      fx.update(dt)
      fxCtx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0)
      fxCtx.clearRect(0, 0, innerWidth, innerHeight)
      fx.draw(fxCtx, scrollX, scrollY)
      fxWasActive = fx.active
    }

    // Element lines that scrolled into view, once the mascot is free to talk.
    if (features.talk && pendingEnter.length && s.mode === 'free' && !s.menuOpen && now - s.lastSayAt > 1200) {
      const el = pendingEnter.shift()!
      const r = el.getBoundingClientRect()
      if (el.isConnected && r.bottom > 0 && r.top < innerHeight) {
        wake(now)
        if (configOf(el).spot) s.focus = { el, until: now + 6000 }
        speak(pickLine(configOf(el).enter, { count: 0, el }), 3000)
        events.emit('enter', { el })
      }
    }

    // Chatter now and then while the visitor is around.
    if (
      features.talk &&
      s.mode === 'free' &&
      !s.sleeping &&
      !s.hop &&
      !s.menuOpen &&
      now - s.lastSayAt > opts.chatterEvery &&
      now - s.lastActive < 8000
    ) {
      const here = activeSpot(now)
      const own = here ? configOf(here).chatter : undefined
      if (asList(own).length) speak(pickLine(own, { count: 0, el: here! }), 2400)
      else if (asList(lines.chatter).length) speak(line('chatter'), 2400)
      else s.lastSayAt = now // nothing to say; check again later
    }

    // Nap when nothing happens for a while.
    if (features.sleep && !s.sleeping && !s.hop && !s.menuOpen && s.mode === 'free' && now - s.lastActive > opts.sleepAfter) goToSleep(now)

    const state: State =
      s.mode === 'held'
        ? 'held'
        : s.mode === 'flying'
          ? 'air'
          : s.mode === 'dizzy'
            ? 'dizzy'
            : s.sleeping
              ? 'sleep'
              : s.hop
                ? 'air'
                : walking
                  ? 'walk'
                  : 'idle'
    if (state !== s.state) {
      root.dataset.state = s.state = state
      events.emit('state', { state })
    }

    // Eyes follow the ball during fetch, the cursor otherwise, or look where it walks.
    const cx = s.pos.x - scrollX
    const cy = s.pos.y - scrollY - FEET / 2
    let ex = char.flip ? 0 : dir
    let ey = 0
    const lookAt =
      s.mode === 'chase' ? { x: ball.body.x - scrollX, y: ball.body.y - scrollY } : now - s.pointer.movedAt < 8000 ? s.pointer : null
    if (!walking && lookAt) {
      const dx = lookAt.x - cx
      const dy = lookAt.y - cy
      ex = Math.abs(dx) > 24 ? Math.sign(dx) : 0
      ey = dy < -40 ? -1 : dy > 40 ? 1 : 0
      if (char.flip && ex) s.facing = ex
      if (char.flip) ex = 0
    }
    if (state === 'sleep' || state === 'dizzy') ex = ey = 0
    s.look[0] = ex
    s.look[1] = ey
    sprite.update({ state, emote: s.emote, blinking: s.blinking, look: s.look, t: now })

    if (char.flip) {
      if (s.facing < 0) root.dataset.flip = ''
      else delete root.dataset.flip
    }

    // Keep the speech bubble on screen.
    const side = cx < 150 ? 'left' : cx > innerWidth - 150 ? 'right' : ''
    if (side !== s.edge) root.dataset.edge = s.edge = side

    root.style.transform = `translate3d(${Math.round(s.pos.x - W / 2)}px, ${Math.round(s.pos.y - FEET)}px, 0)`
  }

  function goToSleep(now: number) {
    s.sleeping = true
    s.sleptAt = now
    speak(line('sleep'), Infinity)
    events.emit('sleep', {})
  }

  // --- API ---------------------------------------------------------------------------------
  const api: Mascot = {
    el: root,
    get character() {
      return char
    },
    get state() {
      return s.state
    },
    get position() {
      return { ...s.pos }
    },
    say: (text, ms) => {
      wake(performance.now())
      speak(text, ms)
    },
    sayOne: (list, ms) => {
      wake(performance.now())
      speak(pickLine(list), ms)
    },
    hush,
    hop: () => {
      const now = performance.now()
      wake(now)
      if (!s.hop && s.mode === 'free') startHop({ ...s.pos }, now, { arc: 26 })
    },
    goTo: (target, ms = 6000) => {
      const el = typeof target === 'string' ? document.querySelector(target) : target
      if (!el) return
      const now = performance.now()
      wake(now)
      s.focus = { el, until: now + ms }
      if (s.mode === 'chase' || s.mode === 'carry') setMode('free')
    },
    emote: (name, ms = 1500) => {
      clearTimeout(emoteTimer)
      s.emote = name
      if (name) root.dataset.emote = name
      else delete root.dataset.emote
      if (name && Number.isFinite(ms)) emoteTimer = window.setTimeout(() => api.emote(null), ms)
    },
    sleep: () => {
      if (!s.sleeping && s.mode === 'free') goToSleep(performance.now())
    },
    wake: () => wake(performance.now()),
    fetch: () => {
      if (ball.held === 'none') startChase()
    },
    openMenu,
    closeMenu,
    attach: (el, config) => {
      registry.set(el, config)
      if (config.enter !== undefined && !entered.has(el)) io.observe(el)
      queueSpot()
      return () => {
        if (registry.get(el) !== config) return
        registry.delete(el)
        io.unobserve(el)
        queueSpot()
      }
    },
    on: events.on,
    setCharacter: (c, sc) => applyCharacter(c, sc),
    setLines: l => {
      siteLines = l
      lines = { ...DEFAULT_LINES, ...char.lines, ...siteLines }
    },
    setMenu: (items, title) => {
      menu = items
      menuTitle = title
      if (s.menuOpen) closeMenu()
      label()
    },
    setFeatures: f => {
      Object.assign(features, f)
      applyFeatures()
    },
    show: () => {
      s.hidden = false
      root.hidden = false
      ballEl.hidden = !features.ball || !ball.placed
    },
    hide: () => {
      hush()
      s.hidden = true
      root.hidden = true
      ballEl.hidden = true
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height)
    },
    destroy: () => {
      cancelAnimationFrame(raf)
      clearBubble()
      clearTimeout(blinkTimer)
      clearTimeout(emoteTimer)
      clearInterval(spotInterval)
      io.disconnect()
      mo.disconnect()
      for (const h of hooks) h.destroy?.()
      events.clear()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('pointerdown', onDocDown)
      document.removeEventListener('click', onDocClick)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
      root.remove()
      ballEl.remove()
      fxCanvas.remove()
    },
  }

  const kit: PluginKit = {
    // The live particle system: setFeatures can turn it on or off.
    get fx() {
      return fx
    },
    surfaces: () => surfaces,
  }
  for (const plugin of options.plugins ?? []) {
    const h = plugin(api, kit)
    if (h) hooks.push(h)
  }

  raf = requestAnimationFrame(frame)
  return api
}
