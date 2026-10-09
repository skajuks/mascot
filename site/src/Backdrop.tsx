import { useEffect, useRef } from 'react'
import { drawEye, eyeLook, hiddenEye, openEye, stepEye, type Eye } from './eyes'

// The floor of the page, from the pixel world on robertskalve.lv: a grid of dim pixels that the
// cursor lights up green like a flashlight, falling off in hard steps. Pairs of green eyes open in
// empty patches of the dark (never over content), watch the light and shut when it comes close.
// One fixed canvas behind the page; touch screens get a light that drifts on its own.

const GAP = 14
const DOT = 2
const RADIUS = 120
const STEPS = 7
// Eyes only open where nothing readable or clickable is under them.
const CONTENT = 'a,button,input,textarea,select,label,img,svg,canvas,video,p,h1,h2,h3,h4,li,pre,code,span,[data-mascot-spot],.mascot,.card'

export function Backdrop({ light: lightOn = true }: { light?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lightOnRef = useRef(lightOn)
  lightOnRef.current = lightOn

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches

    let w = 0
    let h = 0
    let dpr = 1
    let eyes: Eye[] = []
    let eyesDrawn = ''
    let dirty = true
    const light = { x: -999, y: -999, tx: -999, ty: -999, power: 0, target: 0 }
    const look = { x: -999, y: -999 }

    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1)
      w = innerWidth
      h = innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      eyes = Array.from({ length: Math.max(2, Math.min(4, Math.round(w / 400))) }, (_, i) => hiddenEye(performance.now() + 1500 + i * 1700))
      dirty = true
    }

    // One dot per tile, repeated as a pattern: much cheaper than thousands of fillRects.
    const tile = document.createElement('canvas')
    tile.width = tile.height = GAP
    const tctx = tile.getContext('2d')!
    tctx.fillStyle = 'rgba(236,235,227,0.05)'
    tctx.fillRect(0, 0, DOT, DOT)
    const base = ctx.createPattern(tile, 'repeat')!

    const onMove = (e: PointerEvent) => {
      const blocked = (e.target as Element | null)?.closest?.('[data-no-light]')
      light.target = blocked || !lightOnRef.current ? 0 : 1
      if (light.target === 0) return
      if (light.power < 0.05) {
        light.x = e.clientX
        light.y = e.clientY
      }
      light.tx = e.clientX
      light.ty = e.clientY
    }
    const onLeave = () => (light.target = 0)

    const empty = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)
      if (!el || el.closest(CONTENT)) return false
      // A panel with its own background would hide the eyes behind it.
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        if (n.classList.contains('page')) break
        const css = getComputedStyle(n)
        if (css.backgroundImage !== 'none' || !/^(transparent|rgba\(.*, 0\))$/.test(css.backgroundColor)) return false
      }
      return true
    }
    /** Opens a pair somewhere in the dark: clear of content, the light and the other pairs. Eye y is in page coordinates. */
    const place = (e: Eye, now: number) => {
      for (let tries = 0; tries < 12; tries++) {
        const x = Math.round((30 + Math.random() * (w - 60)) / 4) * 4
        const y = Math.round((80 + Math.random() * (h - 120)) / 4) * 4
        if (light.power > 0.3 && Math.hypot(x - light.x, y - light.y) < 170) continue
        if (eyes.some(o => o !== e && o.state !== 'hidden' && Math.hypot(o.x - x, o.y - scrollY - y) < 80)) continue
        if (![[0, 0], [-22, -10], [22, -10], [-22, 10], [22, 10]].every(([dx, dy]) => empty(x + dx, y + dy))) continue
        openEye(e, x, y + scrollY, now, false)
        return
      }
      e.until = now + 1500
    }
    const updateEyes = (now: number) => {
      if (light.power > 0.05) Object.assign(look, { x: light.x, y: light.y + scrollY })
      for (const e of eyes) {
        const lit = light.power > 0.3 && Math.hypot(light.x - e.x, light.y - (e.y - scrollY)) < 100
        if (stepEye(e, now, lit)) place(e, now)
      }
      const drawn = eyes.map(e => `${e.x},${e.y},${Object.values(eyeLook(e, now, look, false)).join(',')}`).join('|')
      if (drawn !== eyesDrawn) dirty = true
      eyesDrawn = drawn
    }
    const onScroll = () => (dirty = true)

    const draw = (time: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, w, h)

      // Grid anchored to the page so it scrolls with the content.
      const oy = -(scrollY % GAP)
      const ox = (w % GAP) / 2
      ctx.save()
      ctx.translate(ox, oy)
      ctx.fillStyle = base
      ctx.fillRect(-ox, -GAP, w, h + GAP * 2)
      ctx.restore()

      if (light.power > 0.01) {
        const c0 = Math.floor((light.x - RADIUS - ox) / GAP)
        const c1 = Math.ceil((light.x + RADIUS - ox) / GAP)
        const r0 = Math.floor((light.y - RADIUS - oy) / GAP)
        const r1 = Math.ceil((light.y + RADIUS - oy) / GAP)
        const tick = Math.floor(time / 120)
        // Row index in page space so the flicker pattern sticks to the dots while scrolling.
        const rowShift = Math.round((scrollY + oy) / GAP)
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const px = ox + c * GAP
            const py = oy + r * GAP
            const d = Math.hypot(px - light.x, py - light.y) / RADIUS
            if (d >= 1) continue
            // Hard falloff steps read as pixel light, not a smooth gradient.
            const level = Math.ceil((1 - d) ** 1.7 * STEPS) / STEPS
            let a = level * 0.85 * light.power
            const n = ((c * 73856093) ^ ((r + rowShift) * 19349663) ^ (tick * 83492791)) >>> 0
            const hot = d < 0.42 && n % 23 === 0
            if (d < 0.6 && n % 7 === 0) a *= 0.6
            const size = d < 0.28 ? DOT + 1 : DOT
            ctx.fillStyle = hot ? `rgba(157,240,189,${Math.min(1, a + 0.3)})` : `rgba(95,211,141,${a})`
            ctx.fillRect(px, py, size, size)
          }
        }
      }

      if (!reduced) for (const e of eyes) drawEye(ctx, e.x, e.y - scrollY, eyeLook(e, time, look, false))
    }

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!lightOnRef.current) light.target = 0

      if (!finePointer && !reduced && lightOnRef.current) {
        // Drift in a slow lissajous so phones see it too.
        const t = now / 1000
        light.tx = w * (0.5 + 0.38 * Math.sin(t * 0.37))
        light.ty = h * (0.5 + 0.35 * Math.sin(t * 0.53 + 1.3))
        light.target = 0.75
        if (light.x < -100) {
          light.x = light.tx
          light.y = light.ty
        }
      }

      const k = reduced ? 1 : 1 - Math.exp(-dt * 9)
      const moving = Math.abs(light.tx - light.x) + Math.abs(light.ty - light.y) > 0.3
      const fading = Math.abs(light.target - light.power) > 0.003
      light.x += (light.tx - light.x) * k
      light.y += (light.ty - light.y) * k
      light.power += (light.target - light.power) * (reduced ? 1 : 1 - Math.exp(-dt * 5))
      if (!reduced) updateEyes(now)

      // The flicker needs frames while lit; otherwise only redraw when something changed.
      if (dirty || moving || fading || light.power > 0.01) {
        draw(now)
        dirty = false
      }
    }

    resize()
    raf = requestAnimationFrame(frame)
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className="backdrop" />
}
