import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Anchored panel, after the LFX UI Popover: portalled so nothing clips it, hung off the element that
// opened it, flipping above when there's no room below. No backdrop; closes on outside click or Escape.
// The pixel version unrolls in steps instead of scaling in.

const GAP = 8
const MARGIN = 12

export function Popover({
  open,
  onClose,
  anchor,
  className = '',
  children,
}: {
  open: boolean
  onClose: () => void
  anchor: Element | null
  className?: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)

  const place = useCallback(() => {
    const panel = panelRef.current
    if (!panel || !anchor) return
    const a = anchor.getBoundingClientRect()
    const pw = panel.offsetWidth
    const ph = panel.offsetHeight
    const below = innerHeight - a.bottom
    const up = below < ph + GAP + MARGIN && a.top > below
    const top = Math.max(MARGIN, Math.min(up ? a.top - ph - GAP : a.bottom + GAP, innerHeight - ph - MARGIN))
    const left = Math.max(MARGIN, Math.min(a.left, innerWidth - pw - MARGIN))
    setPos({ top, left, up })
  }, [anchor])

  useLayoutEffect(() => {
    if (!open) return setPos(null)
    place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || anchor?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
      ;(anchor as HTMLElement | null)?.focus?.()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchor, onClose, place])

  if (!open) return null
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      className={`px-panel ${pos?.up ? 'px-panel-up' : ''} ${className}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}
