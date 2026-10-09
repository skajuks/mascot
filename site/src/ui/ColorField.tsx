import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { BLACK, COLOR_FORMATS, formatColor, hslToRgb, hsvToRgb, isDark, parseColor, rgbToHsv, sameColor, toHex, type ColorFormat, type HSV, type RGBA } from './color'
import { PixelIcon } from './PixelIcon'
import { Popover } from './Popover'

// Colour control, ported from the LFX UI ColorField: a swatch plus its value, with the picking in an
// anchored panel (palette grid, spectrum, channel sliders) instead of the OS colour dialog.
// Pressing the value cycles hex → rgb → hsl for display; what's emitted is always hex.
// `onChange` fires on settled values (pointer release, a grid click, Enter), the panel previews live.
// Pixel changes: square swatches and thumbs, opaque colours only (palettes have no alpha), and the
// panel unrolls in steps. `compact` drops the value text and leaves just the swatch.

type Tab = 'grid' | 'spectrum' | 'sliders'
const TABS: { id: Tab; label: string }[] = [
  { id: 'grid', label: 'Grid' },
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'sliders', label: 'Sliders' },
]

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

// A greyscale run above hue columns, generated so the ramp stays even.
const COLUMNS = 12
const LEVELS = [0.14, 0.24, 0.34, 0.44, 0.54, 0.65, 0.76, 0.87]
const GRID: RGBA[][] = [
  Array.from({ length: COLUMNS }, (_, i) => hslToRgb(0, 0, 1 - i / (COLUMNS - 1))),
  ...LEVELS.map(l => Array.from({ length: COLUMNS }, (_, i) => hslToRgb((200 + i * (360 / COLUMNS)) % 360, l > 0.8 ? 0.75 : 0.9, l))),
]

/** Pointer drag over a box, reported as 0-1 on each axis. */
function useDragBox(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const report = (clientX: number, clientY: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (r) onMove(clamp01((clientX - r.left) / r.width), clamp01((clientY - r.top) / r.height))
  }
  return {
    ref,
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      report(e.clientX, e.clientY)
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) report(e.clientX, e.clientY)
    },
  }
}

export function ColorField({
  value,
  onChange,
  compact = false,
  className = '',
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (hex: string) => void
  compact?: boolean
  className?: string
  'aria-label'?: string
}) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ColorFormat>('hex')
  const swatchRef = useRef<HTMLButtonElement>(null)
  const rgba = parseColor(value) ?? BLACK
  const cycle = () => setFormat(f => COLOR_FORMATS[(COLOR_FORMATS.indexOf(f) + 1) % COLOR_FORMATS.length])

  return (
    <span className={`px-color ${compact ? 'is-compact' : ''} ${className}`}>
      <button
        ref={swatchRef}
        type="button"
        aria-label={ariaLabel ?? 'Choose colour'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`px-swatch ${isDark(rgba) ? 'is-dark' : ''}`}
        style={{ background: toHex(rgba, false) }}
      />
      {!compact && (
        <button type="button" className="px-color-value" onClick={cycle} title="Switch format">
          {formatColor(rgba, format, false)}
        </button>
      )}
      <ColorPanel open={open} onClose={() => setOpen(false)} anchor={swatchRef.current} value={rgba} onChange={c => onChange(toHex(c, false))} format={format} onCycleFormat={cycle} />
    </span>
  )
}

function ColorPanel({
  open,
  onClose,
  anchor,
  value,
  onChange,
  format,
  onCycleFormat,
}: {
  open: boolean
  onClose: () => void
  anchor: HTMLElement | null
  value: RGBA
  onChange: (c: RGBA) => void
  format: ColorFormat
  onCycleFormat: () => void
}) {
  const [tab, setTab] = useState<Tab>('grid')
  // Kept as HSV so dragging to black or white doesn't lose the hue (RGB round-trips would).
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(value))
  const [text, setText] = useState('')
  const editing = useRef(false)
  const live = useMemo(() => hsvToRgb(hsv), [hsv])

  // Adopt outside changes (and the value on open), never mid-drag or mid-typing.
  useEffect(() => {
    if (editing.current || sameColor(live, value)) return
    setHsv(rgbToHsv(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.r, value.g, value.b, open])
  useEffect(() => {
    if (!editing.current) setText(formatColor(live, format, false))
  }, [live, format])

  const preview = (next: Partial<HSV>) => setHsv(h => ({ ...h, ...next }))
  const settle = () => onChange(hsvToRgb(hsv))
  const pick = (c: RGBA) => {
    setHsv(rgbToHsv(c))
    onChange({ ...c, a: 1 })
  }
  const commitText = () => {
    const parsed = parseColor(text)
    editing.current = false
    if (parsed) pick(parsed)
    else setText(formatColor(live, format, false))
  }
  // A paste is a whole value: apply it now. Bare hex (ff0000) too, as design tools copy it.
  const pasteText = (e: ClipboardEvent<HTMLInputElement>) => {
    const raw = e.clipboardData.getData('text').trim()
    const parsed = parseColor(raw) ?? (/^[0-9a-f]{3,8}$/i.test(raw) ? parseColor(`#${raw}`) : null)
    if (!parsed) return
    e.preventDefault()
    editing.current = false
    pick(parsed)
  }

  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatColor(live, format, false))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard blocked: nothing useful to show
    }
  }

  return (
    <Popover open={open} onClose={onClose} anchor={anchor} className="px-color-panel">
      <div className="px-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'grid' && (
        <div className="px-grid">
          {GRID.map((row, y) => (
            <div key={y}>
              {row.map((c, x) => (
                <button
                  key={x}
                  type="button"
                  aria-label={toHex(c, false)}
                  className={sameColor(c, live) ? 'on' : ''}
                  style={{ background: toHex(c, false) }}
                  onClick={() => pick(c)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {tab === 'spectrum' && <Spectrum hsv={hsv} onPreview={preview} onSettle={settle} />}
      {tab === 'sliders' && (
        <div className="px-sliders">
          {(['r', 'g', 'b'] as const).map(key => {
            const at = (v: number) => toHex({ ...live, [key]: v }, false)
            return (
              <Track
                key={key}
                label={key}
                readout={String(Math.round(live[key]))}
                ratio={live[key] / 255}
                onInput={x => setHsv(rgbToHsv({ ...live, [key]: Math.round(x * 255) }))}
                onSettle={settle}
                background={`linear-gradient(to right, ${at(0)}, ${at(255)})`}
              />
            )
          })}
        </div>
      )}

      <div className="px-color-row">
        <span className={`px-swatch is-static ${isDark(live) ? 'is-dark' : ''}`} style={{ background: toHex(live, false) }} />
        <input
          value={text}
          spellCheck={false}
          aria-label="Colour value"
          onChange={e => {
            editing.current = true
            setText(e.target.value)
          }}
          onBlur={commitText}
          onPaste={pasteText}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), commitText())}
        />
        <button type="button" className="px-icon-btn" onClick={copy} title={copied ? 'Copied' : 'Copy colour'} aria-label="Copy colour">
          <PixelIcon name={copied ? 'check' : 'copy'} />
        </button>
        <button type="button" className="px-icon-btn" onClick={onCycleFormat} title="Switch format">
          {format}
        </button>
      </div>
    </Popover>
  )
}

function Spectrum({ hsv, onPreview, onSettle }: { hsv: HSV; onPreview: (next: Partial<HSV>) => void; onSettle: () => void }) {
  const box = useDragBox((x, y) => onPreview({ s: x, v: 1 - y }))
  const hue = toHex(hsvToRgb({ ...hsv, s: 1, v: 1 }), false)
  return (
    <>
      <div
        {...box}
        role="application"
        aria-label="Saturation and brightness"
        onPointerUp={onSettle}
        className="px-spectrum"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hue}` }}
      >
        <span className="px-spectrum-mark" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <Track label="hue" ratio={hsv.h / 360} onInput={x => onPreview({ h: x * 360 })} onSettle={onSettle} background="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" />
    </>
  )
}

/** One draggable track: label, gradient rail, block thumb, optional readout. */
function Track({
  label,
  ratio,
  onInput,
  onSettle,
  background,
  readout,
}: {
  label: string
  ratio: number
  onInput: (ratio: number) => void
  onSettle: () => void
  background: string
  readout?: string
}) {
  const rail = useDragBox(x => onInput(x))
  const step = (delta: number) => {
    onInput(clamp01(ratio + delta))
    onSettle()
  }
  return (
    <div className="px-track">
      <span className="px-track-label">{label}</span>
      <div
        {...rail}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        onPointerUp={onSettle}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), step(-0.01))
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), step(0.01))
        }}
        className="px-rail"
        style={{ background }}
      >
        <span className="px-thumb" style={{ left: `${clamp01(ratio) * 100}%` }} />
      </div>
      {readout !== undefined && <span className="px-track-readout">{readout}</span>}
    </div>
  )
}
