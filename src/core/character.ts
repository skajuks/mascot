// A character is a small stack of pixel layers drawn back to front (body, eyes, legs, ...).
// Each layer picks a frame for the mascot's current pose, so a blink only swaps the eyes and a walk
// cycle only animates the legs. Frames are char matrices (one char per pixel, looked up in the
// palette; any char not in the palette is transparent) or images, for art made elsewhere.

import type { LineBook } from './lines.js'

/** The poses the engine drives. Layers fall back along `FALLBACK` when a pose has no frame. */
export type State = 'idle' | 'walk' | 'air' | 'held' | 'dizzy' | 'sleep'

/**
 * One frame. A string is a matrix written as a multiline template (indentation and blank lines
 * are ignored); an array is one string per row; `{ src }` is an image drawn over the layer's box.
 */
export type Frame = string | readonly string[] | { src: string; width: number; height: number }

/** A static frame, an animation (array of frames), or `null` to hide the layer in that pose. */
export type FrameSet = Frame | { frames: readonly Frame[]; fps?: number; durations?: readonly number[] } | null

export type LayerDef = {
  name?: string
  /** Top-left of this layer's frames on the character grid. Default [0, 0]. */
  at?: readonly [number, number]
  /**
   * Frames keyed by pose. Keys can be engine states, `blink`, `default`, or your own emote names
   * (shown while `mascot.emote(name)` is active).
   */
  frames: Partial<Record<State | 'blink' | 'default', FrameSet>> & Record<string, FrameSet | undefined>
  /** How far (in grid pixels) this layer shifts toward what the mascot looks at. Eyes: 1. */
  look?: number
  /** Extra shift per pose, in grid pixels, e.g. `{ air: [0, -1] }` to tuck legs in. */
  offsets?: Partial<Record<string, readonly [number, number]>>
}

export type CharacterDef = {
  name: string
  palette: Record<string, string>
  /** Grid size. Defaults to the bounding box of all matrix frames. */
  width?: number
  height?: number
  /** Grid row the feet stand on (bottom edge of the lowest foot pixel). Defaults to `height`. */
  feet?: number
  layers: readonly LayerDef[]
  /** Shift of the whole sprite per pose, in grid pixels, e.g. `{ sleep: [0, 1] }` to sink a bit. */
  offsets?: Partial<Record<string, readonly [number, number]>>
  /** Particle colors. Defaults are picked from the palette. */
  fx?: { dust?: string[]; trail?: string[]; spark?: string[] }
  /** Default render scale (CSS px per grid pixel). */
  scale?: number
  /** Mirror the sprite when it walks left. Leave off for symmetric characters that look with their eyes. */
  flip?: boolean
  /** The character's own personality. Site options override these per trigger. */
  lines?: Partial<LineBook>
}

export type ResolvedFrame =
  | { kind: 'matrix'; rows: string[]; width: number; height: number }
  | { kind: 'image'; src: string; width: number; height: number }

export type ResolvedSet = { frames: ResolvedFrame[]; durations: number[]; total: number } | null

export type Layer = {
  name: string
  at: [number, number]
  sets: Map<string, ResolvedSet>
  look: number
  offsets: Record<string, readonly [number, number]>
}

export type Character = {
  name: string
  palette: Record<string, string>
  width: number
  height: number
  feet: number
  layers: Layer[]
  offsets: Record<string, readonly [number, number]>
  fx: { dust: string[]; trail: string[]; spark: string[] }
  scale: number
  flip: boolean
  lines: Partial<LineBook>
  /** True when some layer has a `blink` frame, so the engine schedules blinks. */
  blinks: boolean
}

/** Where a pose looks for frames when a layer doesn't define it. */
export const FALLBACK: Record<State, string[]> = {
  idle: ['idle', 'default'],
  walk: ['walk', 'idle', 'default'],
  air: ['air', 'idle', 'default'],
  held: ['held', 'air', 'idle', 'default'],
  dizzy: ['dizzy', 'idle', 'default'],
  sleep: ['sleep', 'blink', 'idle', 'default'],
}

/** Turns a multiline template into rows: trims each line, drops blank ones. */
export function parseMatrix(frame: string | readonly string[]): string[] {
  if (typeof frame !== 'string') return [...frame]
  return frame
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

function resolveFrame(frame: Frame): ResolvedFrame {
  if (typeof frame === 'object' && 'src' in frame) return { kind: 'image', ...frame }
  const rows = parseMatrix(frame)
  return { kind: 'matrix', rows, width: Math.max(0, ...rows.map(r => r.length)), height: rows.length }
}

function resolveSet(set: FrameSet): ResolvedSet {
  if (set === null) return null
  if (typeof set === 'object' && 'frames' in set) {
    const frames = set.frames.map(resolveFrame)
    const step = 1000 / (set.fps ?? 8)
    const durations = frames.map((_, i) => set.durations?.[i] ?? step)
    return { frames, durations, total: durations.reduce((a, b) => a + b, 0) }
  }
  return { frames: [resolveFrame(set)], durations: [Infinity], total: Infinity }
}

/** Colors in a palette from darkest to lightest, by perceived luminance. */
function byLightness(palette: Record<string, string>): string[] {
  const lum = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return 0.5
    const n = parseInt(m[1], 16)
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  }
  return [...new Set(Object.values(palette))].sort((a, b) => lum(a) - lum(b))
}

/** Validates a character definition and precomputes everything the renderer needs. */
export function defineCharacter(def: CharacterDef): Character {
  let width = 0
  let height = 0
  let blinks = false
  const layers: Layer[] = def.layers.map((l, i) => {
    const at: [number, number] = [l.at?.[0] ?? 0, l.at?.[1] ?? 0]
    const sets = new Map<string, ResolvedSet>()
    for (const [key, set] of Object.entries(l.frames)) {
      if (set === undefined) continue
      const resolved = resolveSet(set)
      sets.set(key, resolved)
      if (key === 'blink') blinks = true
      for (const f of resolved?.frames ?? []) {
        width = Math.max(width, at[0] + f.width)
        height = Math.max(height, at[1] + f.height)
      }
    }
    return { name: l.name ?? `layer${i}`, at, sets, look: l.look ?? 0, offsets: { ...l.offsets } as Layer['offsets'] }
  })
  width = def.width ?? width
  height = def.height ?? height
  if (!width || !height) throw new Error(`mascot: character "${def.name}" has no frames to size it by`)

  const colors = byLightness(def.palette)
  const mid = colors.slice(Math.floor(colors.length / 3)) // skip the darkest third for sparkly bits
  return {
    name: def.name,
    palette: { ...def.palette },
    width,
    height,
    feet: def.feet ?? height,
    layers,
    offsets: { ...def.offsets } as Character['offsets'],
    fx: {
      dust: def.fx?.dust ?? ['#5d5e58', '#807f78', '#a4a39b'],
      trail: def.fx?.trail ?? (mid.length ? mid : colors),
      spark: def.fx?.spark ?? ['#f2b84b', '#ecebe3', ...colors.slice(-2)],
    },
    scale: def.scale ?? 4,
    flip: def.flip ?? false,
    lines: { ...def.lines },
    blinks,
  }
}

/** True for the output of `defineCharacter` (as opposed to a raw definition). */
export const isCharacter = (c: Character | CharacterDef): c is Character => 'blinks' in c

/** Which frame set a layer shows for a pose: emote first, then blink, then the state's fallbacks. */
export function poseKey(layer: Layer, state: State, emote: string | null, blinking: boolean): string | undefined {
  if (emote && layer.sets.has(emote)) return emote
  if (blinking && state !== 'dizzy' && layer.sets.has('blink')) return 'blink'
  return FALLBACK[state].find(key => layer.sets.has(key))
}

/** Grid offset for a pose from an offsets table: emote, then the state's fallbacks. */
export function offsetFor(offsets: Record<string, readonly [number, number]>, state: State, emote: string | null): readonly [number, number] {
  if (emote && offsets[emote]) return offsets[emote]
  for (const key of FALLBACK[state]) if (offsets[key]) return offsets[key]
  return [0, 0]
}

/** Index of the frame showing at time `t` (ms) in a looping set. */
export function frameAt(set: NonNullable<ResolvedSet>, t: number): number {
  if (set.frames.length === 1 || !Number.isFinite(set.total)) return 0
  let rest = t % set.total
  for (let i = 0; i < set.durations.length; i++) {
    rest -= set.durations[i]
    if (rest < 0) return i
  }
  return 0
}
