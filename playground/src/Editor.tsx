import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { blob, defineCharacter, drawCharacter, matrixFromImage, pix, type Character, type CharacterDef, type State } from 'mascot'
import {
  blankFrame,
  fromCharacter,
  KEYS,
  newId,
  POSES,
  resizeChar,
  setPixel,
  stamp,
  toCode,
  toDef,
  type EdChar,
  type EdLayer,
} from './editorModel'

const SAVE_KEY = 'mascot-editor'
const STATES: State[] = ['idle', 'walk', 'air', 'held', 'dizzy', 'sleep']
const CHAIN: Record<string, string[]> = {
  default: ['default'],
  walk: ['walk', 'default'],
  air: ['air', 'default'],
  held: ['held', 'air', 'default'],
  dizzy: ['dizzy', 'default'],
  sleep: ['sleep', 'blink', 'default'],
  blink: ['blink', 'default'],
}
const chainOf = (pose: string) => CHAIN[pose] ?? [pose, 'default']

/** The frames a layer shows for a pose, following the engine's fallbacks. */
function shownFrames(layer: EdLayer, pose: string): string[][] {
  for (const key of chainOf(pose)) if (layer.poses[key]) return layer.poses[key]
  return []
}

function load(): EdChar {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) return JSON.parse(raw) as EdChar
  } catch {
    // start fresh
  }
  return fromCharacter(pix)
}

type History = { past: EdChar[]; now: EdChar; future: EdChar[] }

export function Editor({ onUse }: { onUse: (def: CharacterDef) => void }) {
  const [hist, setHist] = useState<History>(() => ({ past: [], now: load(), future: [] }))
  const ed = hist.now
  const [layerId, setLayerId] = useState(() => ed.layers[0]?.id ?? '')
  const [pose, setPose] = useState<string>('default')
  const [frameIdx, setFrameIdx] = useState(0)
  const [color, setColor] = useState(() => Object.keys(ed.palette)[0] ?? 'a')
  const [tool, setTool] = useState<'paint' | 'erase' | 'fill'>('paint')
  const [ghosts, setGhosts] = useState(true)
  const [copied, setCopied] = useState(false)

  const layer = ed.layers.find(l => l.id === layerId) ?? ed.layers[0]
  const frames = layer ? shownFrames(layer, pose) : []
  const own = layer?.poses[pose] // undefined: borrowing frames from a fallback pose
  const fi = Math.min(frameIdx, Math.max(0, frames.length - 1))

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(ed))
    } catch {
      // the editor works without saving
    }
  }, [ed])

  /** Apply a change; `push` records an undo step (painting pushes once per stroke). */
  const change = (next: EdChar | ((now: EdChar) => EdChar), push = true) =>
    setHist(h => {
      const now = typeof next === 'function' ? next(h.now) : next
      return push ? { past: [...h.past.slice(-60), h.now], now, future: [] } : { ...h, now }
    })
  const undo = () => setHist(h => (h.past.length ? { past: h.past.slice(0, -1), now: h.past[h.past.length - 1], future: [h.now, ...h.future] } : h))
  const redo = () => setHist(h => (h.future.length ? { past: [...h.past, h.now], now: h.future[0], future: h.future.slice(1) } : h))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target instanceof Element && e.target.closest('input, textarea'))) return
      if (e.key === 'z' && !e.shiftKey) (e.preventDefault(), undo())
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) (e.preventDefault(), redo())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setLayer = (fn: (l: EdLayer) => EdLayer, push = true) =>
    change({ ...ed, layers: ed.layers.map(l => (l.id === layer.id ? fn(l) : l)) }, push)

  /** The layer with its own frames for the current pose (copied from the fallback if needed). */
  const editableLayer = (l: EdLayer, w = ed.width, h = ed.height): EdLayer => {
    if (l.poses[pose]?.length) return l
    const base = shownFrames(l, pose)
    return { ...l, poses: { ...l.poses, [pose]: [base[0] ? [...base[0]] : blankFrame(w, h)] } }
  }

  // --- painting -----------------------------------------------------------------------------
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cell = Math.max(8, Math.floor(Math.min(440 / ed.width, 440 / ed.height)))
  const stroke = useRef<{ ch: string } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const w = ed.width * cell
    const h = ed.height * cell
    canvas.width = w
    canvas.height = h
    for (let y = 0; y < ed.height; y++)
      for (let x = 0; x < ed.width; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#1b1c1f' : '#222327'
        ctx.fillRect(x * cell, y * cell, cell, cell)
      }
    for (const l of ed.layers) {
      const list = shownFrames(l, pose)
      const f = l.id === layer?.id ? list[fi] : list[0]
      if (!f || (l.id !== layer?.id && !ghosts)) continue
      ctx.globalAlpha = l.id === layer?.id ? 1 : 0.3
      f.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const c = ed.palette[row[x]]
          if (!c) continue
          ctx.fillStyle = c
          ctx.fillRect(x * cell, y * cell, cell, cell)
        }
      })
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    for (let x = 1; x < ed.width; x++) (ctx.moveTo(x * cell + 0.5, 0), ctx.lineTo(x * cell + 0.5, h))
    for (let y = 1; y < ed.height; y++) (ctx.moveTo(0, y * cell + 0.5), ctx.lineTo(w, y * cell + 0.5))
    ctx.stroke()
    // The ground line the feet stand on.
    ctx.strokeStyle = '#ff5a4f'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, ed.feet * cell - 0.5)
    ctx.lineTo(w, ed.feet * cell - 0.5)
    ctx.stroke()
    ctx.setLineDash([])
  }, [ed, layer, pose, fi, cell, ghosts])

  const cellAt = (e: ReactPointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: Math.floor(((e.clientX - r.left) / r.width) * ed.width), y: Math.floor(((e.clientY - r.top) / r.height) * ed.height) }
  }

  // Strokes fire faster than React re-renders, so each pixel builds on the latest state.
  const paintAt = (x: number, y: number, ch: string, push: boolean) => {
    if (!layer) return
    const id = layer.id
    change(now => {
      const layers = now.layers.map(cur => {
        if (cur.id !== id) return cur
        const l = editableLayer(cur, now.width, now.height)
        const list = [...l.poses[pose]]
        const idx = Math.min(fi, list.length - 1)
        list[idx] = tool === 'fill' ? floodFill(list[idx], x, y, ch) : setPixel(list[idx], x, y, ch)
        return { ...l, poses: { ...l.poses, [pose]: list } }
      })
      return { ...now, layers }
    }, push)
  }

  const onDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const ch = e.button === 2 || tool === 'erase' ? '.' : color
    stroke.current = { ch }
    const { x, y } = cellAt(e)
    paintAt(x, y, ch, true)
    if (tool === 'fill') stroke.current = null
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!stroke.current) return
    const { x, y } = cellAt(e)
    paintAt(x, y, stroke.current.ch, false)
  }
  const onUp = () => (stroke.current = null)

  // --- preview ------------------------------------------------------------------------------
  const character = useMemo<Character | null>(() => {
    try {
      return defineCharacter(toDef(ed))
    } catch {
      return null
    }
  }, [ed])
  const previewRef = useRef<HTMLCanvasElement>(null)
  const [previewState, setPreviewState] = useState<State>('walk')
  const [previewEmote, setPreviewEmote] = useState('')
  const emotes = useMemo(() => [...new Set(ed.layers.flatMap(l => Object.keys(l.poses)))].filter(k => !(POSES as readonly string[]).includes(k) || k === 'happy'), [ed])

  useEffect(() => {
    const canvas = previewRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let look: [number, number] = [0, 0]
    let blinkUntil = 0
    let nextBlink = performance.now() + 2000
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      look = [Math.abs(dx) > 30 ? Math.sign(dx) : 0, dy < -40 ? -1 : dy > 40 ? 1 : 0]
    }
    window.addEventListener('pointermove', onMove)
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#2a2b30'
      ctx.fillRect(0, canvas.height - 24, canvas.width, 24)
      if (!character) return
      if (now > nextBlink) {
        blinkUntil = now + 130
        nextBlink = now + 2500 + Math.random() * 3000
      }
      const scale = Math.max(2, Math.floor(Math.min(140 / character.width, 120 / character.height)))
      const bob = previewState === 'walk' && Math.floor(now / 240) % 2 ? -scale : 0
      const airY = previewState === 'air' || previewState === 'held' ? -18 : 0
      const quiet = previewState === 'sleep' || previewState === 'dizzy'
      drawCharacter(ctx, character, canvas.width / 2, canvas.height - 24 + bob + airY, scale, {
        state: previewState,
        emote: previewEmote || null,
        blinking: now < blinkUntil,
        look: quiet ? [0, 0] : look,
        t: now,
      })
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
    }
  }, [character, previewState, previewEmote])

  // --- palette, layers, frames, import ------------------------------------------------------
  const freeKey = (palette: Record<string, string>) => [...KEYS].find(k => !(k in palette))
  const addColor = () => {
    const k = freeKey(ed.palette)
    if (!k) return
    change({ ...ed, palette: { ...ed.palette, [k]: '#ffffff' } })
    setColor(k)
  }
  const removeColor = (k: string) => {
    const palette = { ...ed.palette }
    delete palette[k]
    change({ ...ed, palette })
    if (color === k) setColor(Object.keys(palette)[0] ?? '')
  }

  const addLayer = () => {
    const l: EdLayer = { id: newId(), name: `layer${ed.layers.length + 1}`, look: 0, poses: { default: [blankFrame(ed.width, ed.height)] }, fps: {} }
    change({ ...ed, layers: [...ed.layers, l] })
    setLayerId(l.id)
  }
  const moveLayer = (dir: -1 | 1) => {
    const i = ed.layers.findIndex(l => l.id === layer.id)
    const j = i + dir
    if (j < 0 || j >= ed.layers.length) return
    const layers = [...ed.layers]
    ;[layers[i], layers[j]] = [layers[j], layers[i]]
    change({ ...ed, layers })
  }
  const deleteLayer = () => {
    if (ed.layers.length < 2) return
    const layers = ed.layers.filter(l => l.id !== layer.id)
    change({ ...ed, layers })
    setLayerId(layers[0].id)
  }

  const addFrame = () => {
    const l = editableLayer(layer)
    const list = [...l.poses[pose]]
    list.splice(fi + 1, 0, [...list[Math.min(fi, list.length - 1)]])
    setLayer(() => ({ ...l, poses: { ...l.poses, [pose]: list }, fps: { ...l.fps, [pose]: l.fps[pose] ?? 8 } }))
    setFrameIdx(fi + 1)
  }
  const removeFrame = () => {
    if (!own || own.length < 2) return
    setLayer(l => ({ ...l, poses: { ...l.poses, [pose]: own.filter((_, i) => i !== fi) } }))
    setFrameIdx(Math.max(0, fi - 1))
  }
  const hideInPose = () => setLayer(l => ({ ...l, poses: { ...l.poses, [pose]: [] } }))
  const resetPose = () =>
    setLayer(l => {
      const poses = { ...l.poses }
      delete poses[pose]
      return { ...l, poses }
    })

  const importPng = async (file: File) => {
    const bitmap = await createImageBitmap(file)
    const img = matrixFromImage(bitmap)
    let next = ed
    if (img.rows.length > ed.height || img.rows[0].length > ed.width)
      next = resizeChar(ed, Math.min(48, Math.max(ed.width, img.rows[0].length)), Math.min(48, Math.max(ed.height, img.rows.length)))
    // Reuse palette keys for colors we already have.
    const palette = { ...next.palette }
    const map: Record<string, string> = {}
    for (const [k, hex] of Object.entries(img.palette)) {
      const existing = Object.entries(palette).find(([, v]) => v.toLowerCase() === hex.toLowerCase())?.[0]
      const key = existing ?? freeKey(palette)
      if (!key) continue
      palette[key] = hex
      map[k] = key
    }
    const rows = img.rows.map(r => [...r].map(ch => map[ch] ?? '.').join(''))
    const l = next.layers.find(x => x.id === layer.id)!
    const target = l.poses[pose]?.length ? l : { ...l, poses: { ...l.poses, [pose]: [blankFrame(next.width, next.height)] } }
    const list = [...target.poses[pose]]
    const idx = Math.min(fi, list.length - 1)
    list[idx] = stamp(list[idx], rows, 0, 0, () => true)
    change({ ...next, palette, layers: next.layers.map(x => (x.id === l.id ? { ...target, poses: { ...target.poses, [pose]: list } } : x)) })
  }

  const code = useMemo(() => toCode(ed), [ed])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked: the code is shown below to copy by hand
    }
  }
  const loadPreset = (c: Character) => {
    const next = fromCharacter(c)
    change(next)
    setLayerId(next.layers[0].id)
    setPose('default')
    setFrameIdx(0)
    setColor(Object.keys(next.palette)[0])
  }

  return (
    <div className="editor">
      <div className="ed-bar">
        <label>
          Name <input value={ed.name} onChange={e => change({ ...ed, name: e.target.value }, false)} size={10} />
        </label>
        <label>
          Size{' '}
          <input type="number" min={4} max={48} value={ed.width} onChange={e => change(resizeChar(ed, clampInt(e.target.value, 4, 48), ed.height))} />
          ×
          <input type="number" min={4} max={48} value={ed.height} onChange={e => change(resizeChar(ed, ed.width, clampInt(e.target.value, 4, 48)))} />
        </label>
        <label title="Grid row the feet stand on (red line)">
          Feet <input type="number" min={1} max={ed.height} value={ed.feet} onChange={e => change({ ...ed, feet: clampInt(e.target.value, 1, ed.height) })} />
        </label>
        <label title="Mirror the sprite when walking left">
          <input type="checkbox" checked={ed.flip} onChange={e => change({ ...ed, flip: e.target.checked })} /> Flip when walking left
        </label>
        <span className="ed-spacer" />
        <button onClick={undo} disabled={!hist.past.length}>Undo</button>
        <button onClick={redo} disabled={!hist.future.length}>Redo</button>
        <button onClick={() => loadPreset(pix)}>Load Pix</button>
        <button onClick={() => loadPreset(blob)}>Load Blob</button>
      </div>

      <div className="ed-main">
        <aside className="ed-side">
          <h4>Layers</h4>
          <p className="ed-hint">Drawn top to bottom, last on top.</p>
          <ul className="ed-layers">
            {ed.layers.map(l => (
              <li key={l.id}>
                <button className={l.id === layer?.id ? 'on' : ''} onClick={() => (setLayerId(l.id), setFrameIdx(0))}>
                  {l.name}
                  {l.look ? ' 👀' : ''}
                </button>
              </li>
            ))}
          </ul>
          {layer && (
            <div className="ed-layer-tools">
              <input value={layer.name} onChange={e => setLayer(l => ({ ...l, name: e.target.value }), false)} aria-label="Layer name" />
              <label title="Shift this layer toward what the mascot looks at">
                <input type="checkbox" checked={layer.look > 0} onChange={e => setLayer(l => ({ ...l, look: e.target.checked ? 1 : 0 }))} /> Follows cursor (eyes)
              </label>
              <div className="ed-row">
                <button onClick={() => moveLayer(-1)} title="Move down (drawn earlier)">↑</button>
                <button onClick={() => moveLayer(1)} title="Move up (drawn later)">↓</button>
                <button onClick={addLayer}>+ Layer</button>
                <button onClick={deleteLayer} disabled={ed.layers.length < 2}>Delete</button>
              </div>
            </div>
          )}
          <label className="ed-check">
            <input type="checkbox" checked={ghosts} onChange={e => setGhosts(e.target.checked)} /> Show other layers
          </label>
        </aside>

        <div className="ed-center">
          <div className="ed-poses" role="tablist">
            {POSES.map(p => (
              <button
                key={p}
                role="tab"
                aria-selected={p === pose}
                className={`${p === pose ? 'on' : ''} ${layer?.poses[p] ? 'has' : ''}`}
                onClick={() => (setPose(p), setFrameIdx(0))}
              >
                {p === 'default' ? 'idle' : p}
              </button>
            ))}
          </div>
          <p className="ed-hint">
            {own === undefined
              ? `"${layer?.name}" has no ${pose} frames yet: showing its fallback. Paint to give it its own.`
              : own.length === 0
                ? `"${layer?.name}" is hidden in this pose.`
                : `Left click paints, right click erases. Ctrl+Z undoes.`}
          </p>
          <canvas
            ref={canvasRef}
            className="ed-canvas"
            style={{ width: ed.width * cell, height: ed.height * cell }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onContextMenu={e => e.preventDefault()}
          />
          <div className="ed-frames">
            {frames.map((f, i) => (
              <button key={i} className={i === fi ? 'on' : ''} onClick={() => setFrameIdx(i)} title={`Frame ${i + 1}`}>
                <Thumb frame={f} palette={ed.palette} />
              </button>
            ))}
            <button onClick={addFrame} title="Duplicate this frame to animate">+ Frame</button>
            {own && own.length > 1 && <button onClick={removeFrame}>− Frame</button>}
            {own && own.length > 1 && (
              <label>
                fps{' '}
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={layer.fps[pose] ?? 8}
                  onChange={e => setLayer(l => ({ ...l, fps: { ...l.fps, [pose]: clampInt(e.target.value, 1, 30) } }), false)}
                />
              </label>
            )}
            <span className="ed-spacer" />
            {pose !== 'default' && own !== undefined && <button onClick={resetPose}>Use fallback</button>}
            {pose !== 'default' && own?.length !== 0 && <button onClick={hideInPose}>Hide layer here</button>}
          </div>
        </div>

        <aside className="ed-side">
          <h4>Tools</h4>
          <div className="ed-row">
            {(['paint', 'erase', 'fill'] as const).map(t => (
              <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>
                {t}
              </button>
            ))}
          </div>
          <h4>Palette</h4>
          <div className="ed-palette">
            {Object.entries(ed.palette).map(([k, v]) => (
              <div key={k} className={`ed-swatch ${k === color ? 'on' : ''}`}>
                <button style={{ background: v }} onClick={() => (setColor(k), setTool(t => (t === 'erase' ? 'paint' : t)))} aria-label={`Color ${k}`} />
                <input type="color" value={v} onChange={e => change({ ...ed, palette: { ...ed.palette, [k]: e.target.value } }, false)} aria-label={`Edit color ${k}`} />
                <code>{k}</code>
                <button className="ed-x" onClick={() => removeColor(k)} aria-label={`Remove color ${k}`}>×</button>
              </div>
            ))}
            <button onClick={addColor}>+ Color</button>
          </div>
          <h4>Preview</h4>
          <canvas ref={previewRef} width={200} height={170} className="ed-preview" />
          <div className="ed-row">
            <select value={previewState} onChange={e => setPreviewState(e.target.value as State)}>
              {STATES.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={previewEmote} onChange={e => setPreviewEmote(e.target.value)}>
              <option value="">no emote</option>
              {emotes.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <label className="ed-file">
            Import PNG into this frame
            <input type="file" accept="image/png,image/gif,image/webp" onChange={e => e.target.files?.[0] && importPng(e.target.files[0]).finally(() => (e.target.value = ''))} />
          </label>
          <button className="primary" onClick={() => onUse(toDef(ed))} disabled={!character}>
            Put it on the page
          </button>
          <button onClick={copy}>{copied ? 'Copied!' : 'Copy code'}</button>
        </aside>
      </div>
      <details className="ed-code">
        <summary>Code</summary>
        <pre>{code}</pre>
      </details>
    </div>
  )
}

function Thumb({ frame, palette }: { frame: string[]; palette: Record<string, string> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    const s = Math.max(1, Math.floor(36 / Math.max(frame.length, frame[0]?.length ?? 1)))
    c.width = (frame[0]?.length ?? 1) * s
    c.height = frame.length * s
    frame.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (!palette[row[x]]) continue
        ctx.fillStyle = palette[row[x]]
        ctx.fillRect(x * s, y * s, s, s)
      }
    })
  }, [frame, palette])
  return <canvas ref={ref} />
}

function floodFill(frame: string[], x: number, y: number, ch: string): string[] {
  const from = frame[y]?.[x]
  if (from === undefined || from === ch) return frame
  const grid = frame.map(r => [...r])
  const stack = [[x, y]]
  while (stack.length) {
    const [cx, cy] = stack.pop()!
    if (grid[cy]?.[cx] !== from) continue
    grid[cy][cx] = ch
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
  }
  return grid.map(r => r.join(''))
}

const clampInt = (v: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || lo)))
