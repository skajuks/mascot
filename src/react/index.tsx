// React bindings. <MascotProvider> creates the mascot once and keeps it in sync with its props;
// useMascot() hands components a stable controller; <MascotSpot> and useMascotSpot() give elements
// mascot behavior (a place to stand, lines to say) without data attributes, so lines can be
// functions and change with state.

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react'
import { createMascot, type ElementConfig, type Mascot, type MascotEvents, type MascotOptions } from '../core/mascot.js'

type Ctx = { handle: MascotHandle; instance: Mascot | null }
const MascotContext = createContext<Ctx | null>(null)

/** Calls made before the mascot exists (or after it's gone) are ignored. */
export type MascotHandle = Pick<
  Mascot,
  'say' | 'sayOne' | 'hush' | 'hop' | 'goTo' | 'emote' | 'sleep' | 'wake' | 'fetch' | 'openMenu' | 'closeMenu' | 'show' | 'hide'
> & {
  /** The live mascot, or null before it mounts. */
  readonly current: Mascot | null
}

const METHODS = ['say', 'sayOne', 'hush', 'hop', 'goTo', 'emote', 'sleep', 'wake', 'fetch', 'openMenu', 'closeMenu', 'show', 'hide'] as const

function createHandle(ref: RefObject<Mascot | null>): MascotHandle {
  const handle = {
    get current() {
      return ref.current
    },
  } as MascotHandle
  for (const m of METHODS) {
    ;(handle as Record<string, unknown>)[m] = (...args: unknown[]) => (ref.current?.[m] as ((...a: unknown[]) => void) | undefined)?.(...args)
  }
  return handle
}

export type MascotProviderProps = MascotOptions & {
  children?: ReactNode
  /** Render the mascot at all. Toggling hides it without losing its state. */
  enabled?: boolean
}

/**
 * Puts the mascot on the page. `character`, `lines`, `menu`, `features` and `enabled` update live;
 * the other options are read once on mount.
 */
export function MascotProvider({ children, enabled = true, ...options }: MascotProviderProps) {
  const ref = useRef<Mascot | null>(null)
  const [handle] = useState(() => createHandle(ref))
  const [instance, setInstance] = useState<Mascot | null>(null)
  const latest = useRef(options)
  latest.current = options

  useEffect(() => {
    const m = createMascot(latest.current)
    ref.current = m
    setInstance(m)
    return () => {
      m.destroy()
      ref.current = null
      setInstance(null)
    }
  }, [])

  const { character, scale, lines, menu, menuTitle, features } = options
  useEffect(() => {
    if (instance && character) instance.setCharacter(character, scale)
  }, [instance, character, scale])
  useEffect(() => {
    if (instance && lines) instance.setLines(lines)
  }, [instance, lines])
  // Menus are usually inline arrays: only rebuild when the labels change, and always call the
  // latest onSelect, so re-renders don't close an open menu.
  const latestMenu = useRef(menu)
  latestMenu.current = menu
  const menuKey = menu?.length ? menu.map(item => item.label).join('\n') : undefined
  useEffect(() => {
    if (!instance) return
    const labels = menuKey === undefined ? undefined : menuKey.split('\n')
    instance.setMenu(labels?.map((label, i) => ({ label, onSelect: m => latestMenu.current?.[i]?.onSelect(m) })), menuTitle)
  }, [instance, menuKey, menuTitle])
  useEffect(() => {
    if (instance && features) instance.setFeatures(features)
  }, [instance, features])
  useEffect(() => {
    if (enabled) instance?.show()
    else instance?.hide()
  }, [instance, enabled])

  return <MascotContext.Provider value={{ handle, instance }}>{children}</MascotContext.Provider>
}

function useCtx(hook: string): Ctx {
  const ctx = useContext(MascotContext)
  if (!ctx) throw new Error(`mascot: ${hook} must be used inside <MascotProvider>`)
  return ctx
}

/** A stable controller for the mascot: `const mascot = useMascot(); mascot.say('Saved!')`. */
export function useMascot(): MascotHandle {
  return useCtx('useMascot').handle
}

/** Subscribes to a mascot event for the lifetime of the component. */
export function useMascotEvent<K extends keyof MascotEvents>(type: K, handler: (e: MascotEvents[K]) => void) {
  const { instance } = useCtx('useMascotEvent')
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => instance?.on(type, e => latest.current(e)), [instance, type])
}

/** Gives an element mascot behavior. The config can change every render (inline functions are fine). */
export function useMascotSpot(ref: RefObject<Element | null>, config: ElementConfig) {
  const { instance } = useCtx('useMascotSpot')
  // One object for the element's lifetime; the engine reads its fields whenever it needs them.
  const [live] = useState<ElementConfig>(() => ({}))
  live.spot = config.spot
  live.say = config.say
  live.enter = config.enter
  live.click = config.click
  live.chatter = config.chatter
  useEffect(() => {
    const el = ref.current
    if (!instance || !el) return
    return instance.attach(el, live)
  }, [instance, ref, live])
}

export type MascotSpotProps = ElementConfig &
  HTMLAttributes<HTMLElement> & {
    /** Element to render. Default 'div'. */
    as?: string
    /** Shorthand for `spot: 'home'`: where the mascot first appears. */
    home?: boolean
  }

/**
 * An element with mascot behavior.
 * `<MascotSpot as="section" spot say={['Nice, right?']} enter="This is the pricing.">...</MascotSpot>`
 */
export function MascotSpot({ as = 'div', spot, home, say, enter, click, chatter, children, ...rest }: MascotSpotProps) {
  const ref = useRef<HTMLElement>(null)
  useMascotSpot(ref, { spot: home ? 'home' : spot, say, enter, click, chatter })
  return createElement(as, { ...rest, ref }, children)
}

export type { ElementConfig, Mascot, MascotEvents, MascotOptions } from '../core/mascot.js'
