import { useState } from 'react'
import { blob, pix, type Character, type CharacterDef, type PerchAct, type PerchEdge, type PerchOptions, type PerchSize } from 'mascot'
import { MascotSpot } from 'mascot/react'
import { NumberField } from './ui/NumberField'
import { PixelIcon } from './ui/PixelIcon'
import { Select } from './ui/Select'

// The perch builder: three stand-in components, a list of perches on them, and controls for the
// selected one. Every change is live on the page, and the code below is what you'd write for it.

type Target = 'card' | 'button' | 'player'
type Who = 'main' | 'pix' | 'blob'
type Entry = { id: number; target: Target; edge: PerchEdge; at: number; size: PerchSize; act: PerchAct; who: Who; emote: string }

const TARGETS: { value: Target; label: string }[] = [
  { value: 'card', label: 'pricing card' },
  { value: 'button', label: 'button' },
  { value: 'player', label: 'music player' },
]
const EDGES: PerchEdge[] = ['top', 'right', 'bottom', 'left']
const SIZES: PerchSize[] = ['xs', 'sm', 'md', 'lg']
const ACTS: PerchAct[] = ['idle', 'wander', 'peek', 'sleep', 'dance']

let nextId = 1
const START: Entry[] = [
  { id: nextId++, target: 'card', edge: 'top', at: 78, size: 'md', act: 'wander', who: 'main', emote: '' },
  { id: nextId++, target: 'card', edge: 'right', at: 30, size: 'sm', act: 'peek', who: 'main', emote: '' },
  { id: nextId++, target: 'button', edge: 'bottom', at: 25, size: 'xs', act: 'idle', who: 'pix', emote: '' },
  { id: nextId++, target: 'player', edge: 'top', at: 30, size: 'sm', act: 'dance', who: 'blob', emote: 'happy' },
]

const describe = (e: Entry) => [e.edge, `${e.at}%`, e.size, e.act, e.emote].filter(Boolean).join(' ')

export function Perches({ main }: { main: Character | CharacterDef }) {
  const [entries, setEntries] = useState<Entry[]>(START)
  const [selected, setSelected] = useState(START[0].id)
  const current = entries.find(e => e.id === selected) ?? entries[0]

  const set = (patch: Partial<Entry>) => setEntries(list => list.map(e => (e.id === current?.id ? { ...e, ...patch } : e)))
  const add = () => {
    const e: Entry = { ...(current ?? START[0]), id: nextId++, at: Math.round(10 + Math.random() * 80) }
    setEntries(list => [...list, e])
    setSelected(e.id)
  }
  const remove = (id: number) => {
    setEntries(list => list.filter(e => e.id !== id))
    if (id === selected) setSelected(entries.find(e => e.id !== id)?.id ?? -1)
  }

  const characterOf = (who: Who) => (who === 'pix' ? pix : who === 'blob' ? blob : undefined)
  const optionsFor = (target: Target): PerchOptions[] =>
    entries
      .filter(e => e.target === target)
      .map(e => ({ edge: e.edge, at: e.at / 100, size: e.size, act: e.act, emote: e.emote || undefined, character: characterOf(e.who) }))

  // Who 'main' follows the page mascot, which may be a character from the editor.
  const mainName = 'name' in main ? main.name : 'main'

  const reactCode = TARGETS.filter(t => entries.some(e => e.target === t.value))
    .map(t => {
      const list = entries.filter(e => e.target === t.value)
      const objs = list.map(e => {
        const parts = [`edge: '${e.edge}'`, `at: ${e.at / 100}`, `size: '${e.size}'`, `act: '${e.act}'`]
        if (e.emote) parts.push(`emote: '${e.emote}'`)
        if (e.who !== 'main') parts.push(`character: ${e.who}`)
        return `{ ${parts.join(', ')} }`
      })
      return `<MascotSpot perch={[\n  ${objs.join(',\n  ')},\n]}>\n  {/* ${t.label} */}\n</MascotSpot>`
    })
    .join('\n\n')
  const htmlCode = TARGETS.filter(t => entries.some(e => e.target === t.value))
    .map(t => {
      const list = entries.filter(e => e.target === t.value)
      // The attribute has no word for another character: those perches use the page mascot here.
      const note = list.some(e => e.who !== 'main') ? '  <!-- other characters need the JS or React API -->\n' : ''
      return `<div data-mascot-perch="${list.map(describe).join('; ')}">\n${note}  <!-- ${t.label} -->\n</div>`
    })
    .join('\n\n')

  return (
    <div className="perch-lab">
      <div className="perch-stage" data-no-light>
        {/* The hard shadow lives on a wrapper: the card's notched corners would clip its own. */}
        <div className="perch-card-shadow">
          <MascotSpot className="perch-card" perch={optionsFor('card')}>
            <div className="perch-card-head">
              <span className="perch-tag">pro</span>
              <span className="perch-popular">
                <PixelIcon name="star" /> popular
              </span>
            </div>
            <p className="perch-price">
              <span className="px-title">$12</span> / month
            </p>
            <ul className="perch-features">
              {['Unlimited mascots', 'Perches included', 'Pixel-perfect bubbles'].map(f => (
                <li key={f}>
                  <PixelIcon name="check" /> {f}
                </li>
              ))}
            </ul>
          </MascotSpot>
        </div>
        <div className="perch-row">
          <MascotSpot className="perch-button" perch={optionsFor('button')}>
            Start free <PixelIcon name="arrow" />
          </MascotSpot>
          <MascotSpot className="perch-player" perch={optionsFor('player')} aria-label="Music player">
            <span className="perch-eq" aria-hidden="true">
              {[0, 1, 2, 3, 4].map(i => (
                <span key={i} style={{ animationDelay: `${-i * 170}ms` }} />
              ))}
            </span>
            <span className="perch-track">
              <span>Pixel Dreams</span>
              <span className="dim">Pix & the Blobs</span>
              <span className="perch-progress" aria-hidden="true">
                <span />
              </span>
            </span>
            <PixelIcon name="play" className="perch-play" />
          </MascotSpot>
        </div>
      </div>

      <div className="perch-panel">
        <h3>perches</h3>
        <ul className="perch-list">
          {entries.map(e => (
            <li key={e.id} className={e.id === current?.id ? 'on' : ''}>
              <button type="button" onClick={() => setSelected(e.id)}>
                <span className="dim">{e.target}</span> {describe(e)}
                {e.who !== 'main' && <span className="dim"> · {e.who}</span>}
              </button>
              <button type="button" className="ed-x" onClick={() => remove(e.id)} aria-label="Remove perch">
                ×
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={add}>
          + perch
        </button>

        {current && (
          <div className="perch-controls">
            <label>
              <span className="px-field-label">on</span>
              <Select aria-label="Element" value={current.target} onChange={target => set({ target })} options={TARGETS} />
            </label>
            <div className="perch-seg" role="group" aria-label="Edge">
              <span className="px-field-label">edge</span>
              {EDGES.map(edge => (
                <button key={edge} type="button" className={current.edge === edge ? 'on' : ''} onClick={() => set({ edge })}>
                  {edge}
                </button>
              ))}
            </div>
            <NumberField label="at %" min={0} max={100} step={5} value={current.at} onChange={at => set({ at })} />
            <div className="perch-seg" role="group" aria-label="Size">
              <span className="px-field-label">size</span>
              {SIZES.map(size => (
                <button key={size} type="button" className={current.size === size ? 'on' : ''} onClick={() => set({ size })}>
                  {size}
                </button>
              ))}
            </div>
            <label>
              <span className="px-field-label">act</span>
              <Select aria-label="Act" value={current.act} onChange={act => set({ act })} options={ACTS.map(a => ({ value: a, label: a }))} />
            </label>
            <label>
              <span className="px-field-label">who</span>
              <Select
                aria-label="Character"
                value={current.who}
                onChange={who => set({ who })}
                options={[
                  { value: 'main', label: `page mascot (${mainName})` },
                  { value: 'pix', label: 'pix' },
                  { value: 'blob', label: 'blob' },
                ]}
              />
            </label>
            <label>
              <span className="px-field-label">emote</span>
              <Select aria-label="Emote" value={current.emote} onChange={emote => set({ emote })} options={[{ value: '', label: 'none' }, { value: 'happy', label: 'happy' }]} />
            </label>
          </div>
        )}
      </div>

      <div className="perch-code">
        <div>
          <h3>react</h3>
          <pre className="code">{reactCode || '// no perches yet'}</pre>
        </div>
        <div>
          <h3>html</h3>
          <pre className="code">{htmlCode || '<!-- no perches yet -->'}</pre>
        </div>
      </div>
    </div>
  )
}
