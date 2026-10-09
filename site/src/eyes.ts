// Green eyes in the dark, from the rift on robertskalve.lv. A pair opens, blinks, watches a point, and shuts and
// sinks when the light reaches it. Drawn in hard 4 px cells, no smoothing.

export type Eye = {
  x: number
  y: number
  state: 'hidden' | 'opening' | 'open' | 'closing'
  t0: number
  /** hidden: when to open again; open: when to shut on its own */
  until: number
  blinkAt: number
  /** When the light first touched it, 0 while unlit. */
  litAt: number
}

export const EYE_COLOR = '#5fd38d'
const PUPIL = '#d6fbe4'
const HALO = '#10241a'
const OPEN_MS = 300
const CLOSE_MS = 420
const BLINK_MS = 130
/** How long the light has to sit on a pair before it shuts. */
const FLINCH_MS = 220

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

export const hiddenEye = (until: number): Eye => ({ x: 0, y: 0, state: 'hidden', t0: 0, until, blinkAt: 0, litAt: 0 })

export function openEye(e: Eye, x: number, y: number, now: number, reduced: boolean) {
  Object.assign(e, {
    x,
    y,
    state: reduced ? 'open' : 'opening',
    t0: now,
    until: now + rand(5000, 11000),
    blinkAt: now + rand(1500, 4500),
    litAt: 0,
  })
}

export function closeEye(e: Eye, now: number) {
  e.state = 'closing'
  e.t0 = now
}

/** Advances one pair. `lit`: the light is on it. Returns true once it is hidden and due to open somewhere again. */
export function stepEye(e: Eye, now: number, lit: boolean): boolean {
  if (e.state === 'hidden') return now > e.until
  if (e.state === 'opening') {
    if (now - e.t0 > OPEN_MS) e.state = 'open'
  } else if (e.state === 'open') {
    // They don't like the light: a moment to react, then shut and sink.
    if (lit) e.litAt ||= now
    else e.litAt = 0
    if ((lit && now - e.litAt > FLINCH_MS) || now > e.until) closeEye(e, now)
    if (now > e.blinkAt + BLINK_MS) e.blinkAt = now + rand(1800, 5500)
  } else if (now - e.t0 > CLOSE_MS) {
    e.state = 'hidden'
    e.until = now + rand(1200, 4000)
  }
  return false
}

/**
 * What a pair looks like right now: stage 0 = gone, 1 = halo only, 2 = half open, 3 = open; `sink` while it
 * shuts; `lx`/`ly` which way the pupils point. Callers compare it between frames to skip redraws.
 */
export function eyeLook(e: Eye, now: number, look: { x: number; y: number }, reduced: boolean) {
  let stage = 3
  let sink = 0
  if (e.state === 'hidden') stage = 0
  else if (e.state === 'opening') {
    const k = (now - e.t0) / OPEN_MS
    stage = k < 0.4 ? 1 : k < 0.7 ? 2 : 3
  } else if (e.state === 'closing') {
    const k = (now - e.t0) / CLOSE_MS
    stage = k < 0.35 ? 2 : k < 0.7 ? 1 : 0
    sink = Math.round((k * 12) / 4) * 4
  } else if (!reduced && now > e.blinkAt && now < e.blinkAt + BLINK_MS) stage = 2
  return { stage, sink, lx: look.x > e.x + 6 ? 1 : 0, ly: look.y > e.y + 6 ? 1 : 0 }
}

/** Draws a pair centered on (x, y) of the context's current coordinates. */
export function drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, { stage, sink, lx, ly }: ReturnType<typeof eyeLook>) {
  if (!stage) return
  for (const side of [-1, 1]) {
    const ex = x + side * 10 - 4
    const ey = y + sink - 4
    ctx.fillStyle = HALO
    ctx.fillRect(ex - 4, ey - 4, 16, 16)
    if (stage === 2) {
      ctx.fillStyle = EYE_COLOR
      ctx.fillRect(ex, ey + 4, 8, 4)
    } else if (stage === 3) {
      ctx.fillStyle = EYE_COLOR
      ctx.fillRect(ex, ey, 8, 8)
      ctx.fillStyle = PUPIL
      ctx.fillRect(ex + lx * 4, ey + ly * 4, 4, 4)
    }
  }
}
