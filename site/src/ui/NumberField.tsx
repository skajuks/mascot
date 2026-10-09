import { useEffect, useRef, useState } from 'react'
import { PixelIcon } from './PixelIcon'

// Integer stepper, after the LFX UI NumberInput: [-][value][+] as three segments with a hairline gap,
// optional preset chips. Pixel changes: square blocks, buttons press down a pixel. Typing edits a
// draft that commits on Enter or blur (so "12" can be typed even when min is 4), arrow keys step,
// and holding a button repeats.

type Preset = { value: number; label?: string }

export function NumberField({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  presets = [],
  label,
  className = '',
  'aria-label': ariaLabel,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  presets?: Preset[]
  /** Shown before the field, in the field's own label element. */
  label?: string
  className?: string
  'aria-label'?: string
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const [draft, setDraft] = useState<string | null>(null)
  const latest = useRef(value)
  latest.current = value
  const repeat = useRef<{ timer: ReturnType<typeof setTimeout> | undefined }>({ timer: undefined })
  useEffect(() => () => clearTimeout(repeat.current.timer), [])

  const bump = (dir: 1 | -1) => {
    const next = clamp(latest.current + dir * step)
    if (next !== latest.current) {
      latest.current = next
      onChange(next)
    }
  }
  // Hold to repeat: a pause, then faster steps.
  const startRepeat = (dir: 1 | -1) => {
    bump(dir)
    const tick = (delay: number) => {
      repeat.current.timer = setTimeout(() => {
        bump(dir)
        tick(Math.max(40, delay * 0.8))
      }, delay)
    }
    tick(380)
  }
  const stopRepeat = () => clearTimeout(repeat.current.timer)

  const commit = () => {
    if (draft === null) return
    const n = parseInt(draft, 10)
    if (!Number.isNaN(n) && clamp(n) !== value) onChange(clamp(n))
    setDraft(null)
  }

  const field = (
    <span className="px-number">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Decrease"
        disabled={value <= min}
        onPointerDown={e => (e.preventDefault(), startRepeat(-1))}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
      >
        <PixelIcon name="minus" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel ?? label}
        value={draft ?? String(value)}
        onChange={e => setDraft(e.target.value.replace(/[^\d-]/g, ''))}
        onBlur={commit}
        onFocus={e => e.target.select()}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.preventDefault(), commit())
          if (e.key === 'Escape') setDraft(null)
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            setDraft(null)
            bump(e.key === 'ArrowUp' ? 1 : -1)
          }
        }}
        style={{ width: `${Math.max(2, String(max).length) + 1.5}ch` }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Increase"
        disabled={value >= max}
        onPointerDown={e => (e.preventDefault(), startRepeat(1))}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
      >
        <PixelIcon name="plus" />
      </button>
    </span>
  )

  return (
    <span className={`px-number-wrap ${className}`}>
      {label && <span className="px-field-label">{label}</span>}
      {field}
      {presets.map(p => (
        <button key={p.value} type="button" className={`px-chip ${value === p.value ? 'on' : ''}`} onClick={() => onChange(clamp(p.value))}>
          {p.label ?? p.value}
        </button>
      ))}
    </span>
  )
}
