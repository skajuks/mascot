import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PixelIcon } from './PixelIcon'

// Replacement for <select>, ported from the LFX UI SelectField and reskinned for the pixel world.
// The native list is drawn by the OS (light, rounded, wrong font), so this renders its own listbox
// into a portal: never clipped by an overflow ancestor, opens upward when there's no room below.
// One highlight block moves between rows (in steps here, not a glide), keyboard works like the
// native control, and a mouse pick makes the trigger's label flicker in where it landed.

export type SelectOption<T extends string | number = string> = {
  value: T
  label: string
  /** Muted text after the label. */
  hint?: string
  /** Leading glyph (a swatch, a dot), on the row and on the trigger. */
  icon?: ReactNode
  disabled?: boolean
}

type SelectProps<T extends string | number> = {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  placeholder?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

const POP_OUT_MS = 90
const MAX_PANEL = 288
const MIN_PANEL_W = 150
const MAX_PANEL_W = 320

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [active, setActive] = useState(-1)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [swap, setSwap] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const selected = useMemo(() => options.find(o => o.value === value) ?? null, [options, value])
  const measure = useCallback(() => rootRef.current && setRect(rootRef.current.getBoundingClientRect()), [])

  useLayoutEffect(() => {
    if (!open) return
    clearTimeout(closeTimer.current)
    setClosing(false)
    measure()
    const i = options.findIndex(o => o.value === value)
    setActive(i >= 0 ? i : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Follow the trigger while the page moves under the fixed panel.
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open, measure])

  /** Animated close (click-away, re-click); focus stays where it is. */
  const dismiss = () => {
    setOpen(false)
    setClosing(true)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setClosing(false), POP_OUT_MS)
  }
  /** Instant close after a pick or Escape: the answer is on the trigger already. */
  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return
      dismiss()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const commit = (i: number, viaPointer = false) => {
    const opt = options[i]
    if (!opt || opt.disabled) return
    if (viaPointer && opt.value !== value) setSwap(true)
    onChange(opt.value)
    close()
  }
  const step = (dir: 1 | -1) => {
    let i = active
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length
      if (!options[i].disabled) break
    }
    setActive(i)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open) commit(active)
        else setOpen(true)
        break
      case 'Escape':
        if (open) {
          e.preventDefault()
          e.stopPropagation()
          close()
        }
        break
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        if (open) step(e.key === 'ArrowDown' ? 1 : -1)
        else setOpen(true)
        break
      case 'Home':
        if (open) (e.preventDefault(), setActive(0))
        break
      case 'End':
        if (open) (e.preventDefault(), setActive(options.length - 1))
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  // Park the highlight on the active row.
  useLayoutEffect(() => {
    const pill = pillRef.current
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    if (!open || !pill) return
    if (!row) return void (pill.style.opacity = '0')
    pill.style.transform = `translateY(${row.offsetTop}px)`
    pill.style.height = `${row.offsetHeight}px`
    pill.style.opacity = '1'
    row.scrollIntoView({ block: 'nearest' })
  }, [open, rect !== null, active])

  const openUp = !!rect && innerHeight - rect.bottom < Math.min(MAX_PANEL, options.length * 32 + 12) + 8
  const minWidth = rect ? Math.max(rect.width, MIN_PANEL_W) : undefined
  const left = rect ? Math.max(8, Math.min(rect.left, innerWidth - (minWidth ?? 0) - 8)) : 0

  return (
    <div ref={rootRef} className={`px-select ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && (open ? dismiss() : setOpen(true))}
        onKeyDown={onKeyDown}
        className={`px-select-trigger ${open ? 'is-open' : ''}`}
      >
        <span key={String(value)} onAnimationEnd={() => setSwap(false)} className={`px-select-value ${swap ? 'is-swapping' : ''}`}>
          {selected?.icon}
          <span className={selected ? '' : 'px-dim'}>{selected ? selected.label : placeholder}</span>
        </span>
        <PixelIcon name="chevron" className="px-chevron" />
      </button>

      {(open || closing) &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            className={`px-select-panel ${openUp ? 'px-panel-up' : ''} ${open ? '' : 'is-closing'}`}
            style={{
              left,
              minWidth,
              maxWidth: Math.max(minWidth ?? 0, Math.min(MAX_PANEL_W, innerWidth - 16)),
              ...(openUp ? { bottom: innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
            }}
          >
            {options.length === 0 && <div className="px-select-empty">No options</div>}
            <div ref={listRef} className="px-select-list">
              <span ref={pillRef} aria-hidden="true" className="px-select-pill" />
              {options.map((opt, i) => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    data-index={i}
                    tabIndex={-1}
                    onMouseEnter={() => i !== active && setActive(i)}
                    onClick={() => commit(i, true)}
                    className={`px-select-option ${isSelected ? 'is-selected' : ''} ${i === active ? 'is-active' : ''}`}
                  >
                    {opt.icon}
                    <span className="px-select-label">
                      {opt.label}
                      {opt.hint && <span className="px-dim"> {opt.hint}</span>}
                    </span>
                    {isSelected && <PixelIcon name="check" />}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
