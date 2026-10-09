// The editor works on full-size frames (every frame covers the whole grid) so painting is simple.
// Converting back to a CharacterDef crops each layer to the box its pixels use, which keeps the
// exported code small and readable.

import type { Character, CharacterDef, FrameSet, LayerDef } from '@robertskalve/mascot'

export type EdLayer = {
  id: string
  name: string
  look: number
  /** Frames per pose. An empty list hides the layer in that pose. */
  poses: Record<string, string[][]>
  fps: Record<string, number>
}

export type EdChar = {
  name: string
  width: number
  height: number
  feet: number
  flip: boolean
  palette: Record<string, string>
  layers: EdLayer[]
}

export const POSES = ['default', 'walk', 'air', 'held', 'dizzy', 'sleep', 'blink', 'happy'] as const
export const KEYS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

let nextId = 0
export const newId = () => `l${Date.now().toString(36)}${nextId++}`

export const blankFrame = (w: number, h: number) => Array.from({ length: h }, () => '.'.repeat(w))

export function setPixel(frame: string[], x: number, y: number, ch: string): string[] {
  if (frame[y]?.[x] === undefined || frame[y][x] === ch) return frame
  const next = [...frame]
  next[y] = frame[y].slice(0, x) + ch + frame[y].slice(x + 1)
  return next
}

/** Pastes `rows` into `frame` with its top left at (x, y), skipping transparent pixels. */
export function stamp(frame: string[], rows: readonly string[], x: number, y: number, keep = (ch: string) => ch !== '.'): string[] {
  return frame.map((row, fy) => {
    const src = rows[fy - y]
    if (src === undefined) return row
    let out = ''
    for (let fx = 0; fx < row.length; fx++) {
      const ch = src[fx - x]
      out += ch !== undefined && keep(ch) ? ch : row[fx]
    }
    return out
  })
}

export function resizeFrame(frame: string[], w: number, h: number): string[] {
  return Array.from({ length: h }, (_, y) => (frame[y] ?? '').slice(0, w).padEnd(w, '.'))
}

export function resizeChar(ed: EdChar, w: number, h: number): EdChar {
  return {
    ...ed,
    width: w,
    height: h,
    feet: Math.min(ed.feet, h),
    layers: ed.layers.map(l => ({
      ...l,
      poses: Object.fromEntries(Object.entries(l.poses).map(([k, frames]) => [k, frames.map(f => resizeFrame(f, w, h))])),
    })),
  }
}

/** Expands a character into editable full-size frames. Image frames come in blank. */
export function fromCharacter(c: Character): EdChar {
  return {
    name: c.name,
    width: c.width,
    height: c.height,
    feet: c.feet,
    flip: c.flip,
    palette: { ...c.palette },
    layers: c.layers.map(layer => {
      const poses: Record<string, string[][]> = {}
      const fps: Record<string, number> = {}
      for (const [key, set] of layer.sets) {
        if (!set) {
          poses[key] = []
          continue
        }
        poses[key] = set.frames.map(f => (f.kind === 'matrix' ? stamp(blankFrame(c.width, c.height), f.rows, layer.at[0], layer.at[1], () => true) : blankFrame(c.width, c.height)))
        if (set.frames.length > 1) fps[key] = Math.round((set.frames.length * 10000) / set.total) / 10
      }
      return { id: newId(), name: layer.name, look: layer.look, poses, fps }
    }),
  }
}

/** The box (inclusive) of painted pixels across frames, or null if nothing is painted. */
function bounds(frames: string[][], palette: Record<string, string>) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -1
  let y1 = -1
  for (const f of frames)
    f.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (!palette[row[x]]) continue
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
    })
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

export function toDef(ed: EdChar): CharacterDef {
  const layers: LayerDef[] = ed.layers.map(l => {
    const all = Object.values(l.poses).flat()
    const box = bounds(all, ed.palette) ?? { x0: 0, y0: 0, x1: 0, y1: 0 }
    const crop = (f: string[]) => f.slice(box.y0, box.y1 + 1).map(r => r.slice(box.x0, box.x1 + 1))
    const frames: Record<string, FrameSet> = {}
    for (const [key, list] of Object.entries(l.poses)) {
      if (list.length === 0) frames[key] = null
      else if (list.length === 1) frames[key] = crop(list[0])
      else frames[key] = { frames: list.map(crop), fps: l.fps[key] ?? 8 }
    }
    return { name: l.name, at: [box.x0, box.y0], look: l.look || undefined, frames }
  })
  return { name: ed.name, palette: ed.palette, width: ed.width, height: ed.height, feet: ed.feet, flip: ed.flip || undefined, layers }
}

const ident = (s: string) => s.replace(/[^A-Za-z0-9_$]/g, '').replace(/^(\d)/, '_$1') || 'mascot'
const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1)

function matrixCode(rows: readonly string[], indent: string) {
  return '`\n' + rows.map(r => `${indent}  ${r}`).join('\n') + '`'
}

/** TypeScript for the character, ready to paste into a project. */
export function toCode(ed: EdChar): string {
  const def = toDef(ed)
  const pad = '      '
  const layers = def.layers
    .map(l => {
      const frames = Object.entries(l.frames)
        .map(([key, set]) => {
          const k = /^[a-z_$][\w$]*$/i.test(key) ? key : JSON.stringify(key)
          if (set === null) return `${pad}  ${k}: null,`
          if (typeof set === 'object' && 'frames' in set)
            return `${pad}  ${k}: { frames: [\n${set.frames.map(f => `${pad}    ${matrixCode(f as string[], pad + '    ')},`).join('\n')}\n${pad}  ], fps: ${set.fps} },`
          return `${pad}  ${k}: ${matrixCode(set as string[], pad + '  ')},`
        })
        .join('\n')
      const head = [`name: ${JSON.stringify(l.name)}`, l.at && (l.at[0] || l.at[1]) ? `at: [${l.at[0]}, ${l.at[1]}]` : '', l.look ? `look: ${l.look}` : '']
        .filter(Boolean)
        .join(', ')
      return `    {\n      ${head},\n      frames: {\n${frames}\n      },\n    },`
    })
    .join('\n')
  const palette = Object.entries(def.palette)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(', ')
  return `import { defineCharacter } from '@robertskalve/mascot'

export const ${lowerFirst(ident(ed.name))} = defineCharacter({
  name: ${JSON.stringify(ed.name)},
  palette: { ${palette} },
  width: ${def.width},
  height: ${def.height},
  feet: ${def.feet},${def.flip ? '\n  flip: true,' : ''}
  layers: [
${layers}
  ],
})
`
}
