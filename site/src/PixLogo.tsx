import { useEffect, useRef } from 'react'
import { drawCharacter, pix } from 'mascot'

// Pix in the navbar, drawn with the library itself: blinks now and then, the on-air light pulses,
// and the eyes follow the cursor around the page.

const SCALE = 2

export function PixLogo() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(2, devicePixelRatio || 1)
    const w = pix.width * SCALE
    const h = pix.height * SCALE
    canvas.width = w * dpr
    canvas.height = h * dpr
    let look: [number, number] = [0, 0]
    let blinkUntil = 0
    let nextBlink = performance.now() + 2500
    let drawn = ''

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      look = [Math.abs(dx) > 16 ? Math.sign(dx) : 0, dy > 24 ? 1 : dy < -24 ? -1 : 0]
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    let raf = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now > nextBlink) {
        blinkUntil = now + 130
        nextBlink = now + 2500 + Math.random() * 3500
      }
      const blinking = now < blinkUntil
      // The light's frame changes slowly; only repaint when something visible changed.
      const key = `${look},${blinking},${now % 2400 < 1680}`
      if (key === drawn) return
      drawn = key
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      drawCharacter(ctx, pix, w / 2, h, SCALE, { look, blinking, t: now })
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className="logo-pix" style={{ width: pix.width * SCALE, height: pix.height * SCALE }} />
}
