/** A tiny typed event emitter. `on` returns the unsubscribe function. */
export function createEmitter<Events extends Record<string, unknown>>() {
  const listeners = new Map<keyof Events, Set<(payload: never) => void>>()
  return {
    emit<K extends keyof Events>(type: K, payload: Events[K]) {
      for (const fn of listeners.get(type) ?? []) (fn as (p: Events[K]) => void)(payload)
    },
    on<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void) {
      let set = listeners.get(type)
      if (!set) listeners.set(type, (set = new Set()))
      set.add(fn as (payload: never) => void)
      return () => {
        set.delete(fn as (payload: never) => void)
      }
    },
    clear() {
      listeners.clear()
    },
  }
}
