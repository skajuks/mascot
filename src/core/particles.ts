// Pixel particles: square bits with gravity that fade out in hard steps, so they stay pixel art.
// Positions are in whatever coordinates you draw with; `draw` subtracts an offset (scroll, say).

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  gravity: number
  drag: number
  life: number
  age: number
  size: number
  color: string
}

export type ParticleColors = { dust: string[]; trail: string[]; spark: string[]; smoke?: string[] }

const SMOKE = ['#6f6f69', '#8f8e88', '#adaca5', '#c9c8c1']
const MAX = 260

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)

export class Particles {
  private list: Particle[] = []
  colors: ParticleColors

  constructor(colors: ParticleColors) {
    this.colors = colors
  }

  get active() {
    return this.list.length > 0
  }

  private add(p: Omit<Particle, 'age'>) {
    if (this.list.length >= MAX) this.list.shift()
    this.list.push({ ...p, age: 0 })
  }

  /** Little puffs kicked up behind the feet while walking. */
  dust(x: number, y: number, dir: number) {
    for (let i = 0; i < 2; i++) {
      this.add({
        x: x - dir * rand(6, 14),
        y: y - rand(0, 3),
        vx: -dir * rand(10, 40),
        vy: -rand(15, 45),
        gravity: 60,
        drag: 2.5,
        life: rand(0.3, 0.5),
        size: Math.random() < 0.5 ? 4 : 2,
        color: pick(this.colors.dust),
      })
    }
  }

  /** A ring of dust along the ground, for takeoff and landing. */
  burst(x: number, y: number, strength = 1) {
    const n = Math.round(6 + strength * 8)
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1
      this.add({
        x: x + side * rand(4, 16),
        y: y - rand(0, 4),
        vx: side * rand(40, 120) * strength,
        vy: -rand(20, 90) * strength,
        gravity: 260,
        drag: 3,
        life: rand(0.35, 0.6),
        size: Math.random() < 0.6 ? 4 : 2,
        color: pick(this.colors.dust),
      })
    }
  }

  /** Warm pixels left behind mid-air. */
  trail(x: number, y: number) {
    for (let i = 0; i < 2; i++) {
      this.add({
        x: x + rand(-10, 10),
        y: y + rand(-6, 8),
        vx: rand(-20, 20),
        vy: rand(10, 45),
        gravity: 40,
        drag: 1.5,
        life: rand(0.4, 0.7),
        size: Math.random() < 0.55 ? 4 : 2,
        color: pick(this.colors.trail),
      })
    }
  }

  /** Grey puffs that hang back and drift up. */
  smoke(x: number, y: number) {
    this.add({
      x: x + rand(-3, 3),
      y: y + rand(-3, 3),
      vx: rand(-40, -10),
      vy: rand(-18, -4),
      gravity: -12,
      drag: 1.2,
      life: rand(0.7, 1.2),
      size: Math.random() < 0.6 ? 6 : 4,
      color: pick(this.colors.smoke ?? SMOKE),
    })
  }

  /** Drips of one color, falling. */
  drops(x: number, y: number, color: string) {
    this.add({
      x,
      y,
      vx: rand(-15, 15),
      vy: rand(-25, 10),
      gravity: 420,
      drag: 1,
      life: rand(0.35, 0.6),
      size: Math.random() < 0.5 ? 4 : 2,
      color,
    })
  }

  /** Sparks flying out in every direction. */
  sparks(x: number, y: number, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2)
      const speed = rand(80, 170)
      this.add({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 40,
        gravity: 220,
        drag: 2,
        life: rand(0.4, 0.7),
        size: Math.random() < 0.5 ? 4 : 2,
        color: pick(this.colors.spark),
      })
    }
  }

  update(dt: number) {
    for (const p of this.list) {
      p.age += dt
      p.vx *= Math.max(0, 1 - p.drag * dt)
      p.vy = p.vy * Math.max(0, 1 - p.drag * dt) + p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    this.list = this.list.filter(p => p.age < p.life)
  }

  draw(ctx: CanvasRenderingContext2D, offsetX = 0, offsetY = 0) {
    for (const p of this.list) {
      const t = p.age / p.life
      ctx.globalAlpha = t < 0.5 ? 1 : t < 0.8 ? 0.6 : 0.3
      const size = t > 0.7 && p.size > 2 ? p.size / 2 : p.size
      ctx.fillStyle = p.color
      ctx.fillRect(Math.round(p.x - offsetX - size / 2), Math.round(p.y - offsetY - size / 2), size, size)
    }
    ctx.globalAlpha = 1
  }
}
