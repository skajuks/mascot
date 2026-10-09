// What the mascot says. A line is text, or a function returning text (for counts, names, i18n).
// Every trigger has a list; the mascot picks one at random, never the same one twice in a row.

export type LineContext = {
  /** How many times this trigger has fired (pokes, fetches, ...). */
  count: number
  /** The element that triggered it, for element lines. */
  el?: Element
}
export type Line = string | ((ctx: LineContext) => string | null | undefined)
export type Lines = readonly Line[] | Line

/** The mascot's own triggers. Any of them can be set to `[]` to keep it quiet. */
export type LineBook = {
  /** On arrival. */
  greet: Lines
  /** Clicked or tapped. */
  poke: Lines
  /** Picked up. */
  held: Lines
  /** Thrown hard. */
  thrown: Lines
  /** Landed after a throw. */
  dizzy: Lines
  /** Falling asleep (shown until it wakes). */
  sleep: Lines
  /** Woken up after a nap. */
  wake: Lines
  /** Now and then while the visitor is around, unless a spot has its own `chatter`. */
  chatter: Lines
  /** Off after the ball. */
  chase: Lines
  /** Brought the ball back. */
  fetched: Lines
  /** Couldn't reach the ball. */
  giveUp: Lines
  /** Hovering the ball. */
  ball: Lines
}

export const DEFAULT_LINES: LineBook = {
  greet: ['Hi! I live here.', 'Oh, a visitor!', 'Hello there.'],
  poke: ['Hey!', 'That tickles.', 'Beep.', 'I felt that.', 'Again?'],
  held: ['Whoa, put me down!', 'Up we go...', 'I can see my house from here.'],
  thrown: ['Wheeee!', 'Aaaaa!'],
  dizzy: ['Everything is spinning.', 'Again! No wait.', 'Ow. Pixels everywhere.'],
  sleep: ['zzz'],
  wake: ['Huh? I was not sleeping.', 'Oh, you are back!', 'Just resting my pixels.'],
  chatter: [],
  chase: ['Ball!', 'Got it, got it!', 'Mine!'],
  fetched: ['Again!', 'Here you go.', 'Throw it further!'],
  giveUp: ['I lost it.', 'Too far.'],
  ball: ['Throw it!', 'Ooh, the ball.'],
}

const last = new WeakMap<object, number>()

/** Turns `Lines` into a list. */
export const asList = (lines: Lines | undefined): readonly Line[] => (lines == null ? [] : Array.isArray(lines) ? lines : [lines as Line])

/** Picks a random line, avoiding the previous pick from the same list when possible. */
export function pickLine(lines: Lines | undefined, ctx: LineContext = { count: 0 }): string | null {
  const list = asList(lines)
  if (list.length === 0) return null
  let i = Math.floor(Math.random() * list.length)
  if (list.length > 1 && i === last.get(list)) i = (i + 1) % list.length
  last.set(list, i)
  const line = list[i]
  return (typeof line === 'function' ? line(ctx) : line) || null
}

/** Reads a `data-mascot-*` attribute: lines separated by `|`. */
export const splitAttr = (value: string | null): string[] => (value ? value.split('|').map(s => s.trim()).filter(Boolean) : [])
