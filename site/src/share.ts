// Shareable characters: the cropped CharacterDef, JSON, deflated, base64url, in the URL hash (#c=...).
// Links come from strangers, so decoding rebuilds the definition field by field and keeps only what a
// pixel character needs: hex colours, char matrices, small grids. No image frames (they'd load any URL).

import { defineCharacter, type CharacterDef, type FrameSet, type LayerDef } from '@robertskalve/mascot'

const PREFIX = 'c='
const MAX_GRID = 48
const MAX_LAYERS = 16
const MAX_FRAMES = 16
const MAX_LINK = 16_000

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

export async function encodeCharacter(def: CharacterDef): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(def))
  return PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

/** The character in a location hash, or null if there's none. Throws on a broken or hostile link. */
export async function decodeCharacter(hash: string): Promise<CharacterDef | null> {
  const raw = hash.replace(/^#/, '')
  if (!raw.startsWith(PREFIX)) return null
  const data = raw.slice(PREFIX.length)
  if (data.length > MAX_LINK) throw new Error('That link is too long to be a character.')
  const json = new TextDecoder().decode(await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw')))
  const def = sanitize(JSON.parse(json))
  defineCharacter(def) // throws if it can't be drawn
  return def
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined)
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined)

function matrix(v: unknown): string[] {
  const rows = typeof v === 'string' ? v.split('\n').map(r => r.trim()).filter(Boolean) : Array.isArray(v) ? v : null
  if (!rows || rows.length > MAX_GRID || !rows.every(r => typeof r === 'string' && r.length <= MAX_GRID)) throw new Error('Bad frame')
  return rows as string[]
}

function frameSet(v: unknown): FrameSet {
  if (v === null) return null
  if (isObj(v)) {
    if (!Array.isArray(v.frames) || v.frames.length === 0 || v.frames.length > MAX_FRAMES) throw new Error('Bad animation')
    return { frames: v.frames.map(matrix), fps: int(v.fps, 1, 30) ?? 8 }
  }
  return matrix(v)
}

function sanitize(v: unknown): CharacterDef {
  if (!isObj(v) || !isObj(v.palette) || !Array.isArray(v.layers)) throw new Error('Not a character')
  const palette: Record<string, string> = {}
  for (const [k, c] of Object.entries(v.palette)) {
    if (k.length === 1 && k !== '.' && typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) palette[k] = c
  }
  if (v.layers.length === 0 || v.layers.length > MAX_LAYERS) throw new Error('Bad layers')
  const layers: LayerDef[] = v.layers.map(l => {
    if (!isObj(l) || !isObj(l.frames)) throw new Error('Bad layer')
    const frames: Record<string, FrameSet> = {}
    for (const [key, set] of Object.entries(l.frames)) if (/^[\w-]{1,24}$/.test(key)) frames[key] = frameSet(set)
    const at = Array.isArray(l.at) ? ([int(l.at[0], 0, MAX_GRID) ?? 0, int(l.at[1], 0, MAX_GRID) ?? 0] as const) : undefined
    return { name: text(l.name, 24), at, look: int(l.look, 0, 2), frames }
  })
  return {
    name: text(v.name, 32) || 'Mascot',
    palette,
    width: int(v.width, 1, MAX_GRID),
    height: int(v.height, 1, MAX_GRID),
    feet: int(v.feet, 1, MAX_GRID),
    flip: v.flip === true || undefined,
    layers,
  }
}
