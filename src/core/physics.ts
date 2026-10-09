// Tiny platformer physics in document coordinates, for the ball and a thrown mascot.
// Bodies are points at their bottom-center with a half width. They fall with gravity, bounce off
// the sides of the screen, and land on surfaces: the top edges of spot elements, plus the bottom
// of the screen so nothing falls forever. A line `ceiling` px below the top of the screen stops
// things flying out of sight (under a fixed header, say).

export type Surface = { left: number; right: number; y: number; el: Element | null }
export type Body = { x: number; y: number; vx: number; vy: number; half: number; on: Surface | null }
export type StepEvent = 'land' | 'bounce' | 'wall' | null

const GRAVITY = 2300
const MAX_SPEED = 2600

/** An element's top edge in document coordinates. */
export function topOf(el: Element): Omit<Surface, 'el'> {
  const r = el.getBoundingClientRect()
  return { left: r.left + scrollX, right: r.right + scrollX, y: r.top + scrollY }
}

/** Surfaces of the given elements that are near the viewport. */
export function collectSurfaces(els: Iterable<Element>): Surface[] {
  const list: Surface[] = []
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.bottom < -300 || r.top > innerHeight + 300) continue
    list.push({ left: r.left + scrollX, right: r.right + scrollX, y: r.top + scrollY, el })
  }
  return list
}

export const screenFloor = (): Surface => ({
  left: -1e6,
  right: 1e6,
  y: scrollY + innerHeight - 6,
  el: null,
})

export function capSpeed(b: Body) {
  const v = Math.hypot(b.vx, b.vy)
  if (v > MAX_SPEED) {
    b.vx *= MAX_SPEED / v
    b.vy *= MAX_SPEED / v
  }
}

/** Advance one body. `bounce` is how much vertical speed survives a hit. */
export function stepBody(b: Body, dt: number, surfaces: Surface[], opts: { bounce?: number; friction?: number; ceiling?: number } = {}): StepEvent {
  const { bounce = 0.5, friction = 3, ceiling = 0 } = opts
  const minX = scrollX + b.half
  const maxX = scrollX + document.documentElement.clientWidth - b.half
  let event: StepEvent = null

  if (b.on) {
    // Rolling or sliding along a surface.
    if (!b.on.el) b.on = screenFloor() // the screen floor moves with scrolling
    b.vx *= Math.max(0, 1 - friction * dt)
    if (Math.abs(b.vx) < 4) b.vx = 0
    b.x += b.vx * dt
    b.y = b.on.y
    if (b.x < minX || b.x > maxX) {
      b.x = Math.min(maxX, Math.max(minX, b.x))
      b.vx *= -0.5
    }
    if (b.x < b.on.left || b.x > b.on.right) b.on = null // rolled off the edge
    return null
  }

  const prevY = b.y
  b.vy += GRAVITY * dt
  b.x += b.vx * dt
  b.y += b.vy * dt

  if (b.x < minX || b.x > maxX) {
    b.x = Math.min(maxX, Math.max(minX, b.x))
    b.vx *= -0.6
    event = 'wall'
  }

  const top = scrollY + ceiling + b.half * 2
  if (b.vy < 0 && b.y < top) {
    b.y = top
    b.vy *= -0.5
    event = 'wall'
  }

  if (b.vy > 0) {
    // First surface crossed this step wins.
    let hit: Surface | null = null
    for (const s of [...surfaces, screenFloor()]) {
      if (b.x < s.left || b.x > s.right) continue
      if (prevY <= s.y + 1 && b.y >= s.y && (!hit || s.y < hit.y)) hit = s
    }
    if (hit) {
      b.y = hit.y
      if (b.vy > 320) {
        b.vy = -b.vy * bounce
        b.vx *= 0.82
        return 'bounce'
      }
      b.vy = 0
      b.on = hit
      return 'land'
    }
  }
  return event
}
