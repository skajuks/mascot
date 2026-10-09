import { useState, type ReactNode } from 'react'
import { blob, pix, type Character, type CharacterDef, type Features } from 'mascot'
import { MascotProvider, MascotSpot, useMascot, useMascotEvent } from 'mascot/react'
import { Backdrop } from './Backdrop'
import { Editor } from './Editor'
import { PixLogo } from './PixLogo'
import { PixelIcon } from './ui/PixelIcon'

const NAV_HEIGHT = 64

export function App() {
  const [character, setCharacter] = useState<Character | CharacterDef>(pix)
  const [features, setFeatures] = useState<Partial<Features>>({ ball: true })
  const [withMenu, setWithMenu] = useState(false)
  const [flashlight, setFlashlight] = useState(true)

  return (
    <MascotProvider
      character={character}
      features={features}
      ceiling={NAV_HEIGHT}
      menuTitle="Need a hand?"
      menu={
        withMenu
          ? [
              { label: flashlight ? 'Flashlight off' : 'Flashlight on', onSelect: m => (setFlashlight(f => !f), m.say(flashlight ? 'Who turned off the lights?' : 'Much better.')) },
              { label: 'Take me to the editor', onSelect: m => (document.getElementById('editor')?.scrollIntoView(), m.say('Make me a friend!')) },
              { label: 'Back to top', onSelect: () => scrollTo({ top: 0 }) },
              { label: 'Tell me a joke', onSelect: m => m.sayOne(['I would tell a UDP joke, but you might not get it.', 'There are 10 kinds of mascots.', 'My favorite color is #e0704f.'], 4000) },
            ]
          : undefined
      }
    >
      <div className="page">
        <Backdrop light={flashlight} />
        <nav className="nav" style={{ height: NAV_HEIGHT }}>
          <a href="#top" className="logo">
            <PixLogo />
            mascot
          </a>
          <a href="#spots">spots</a>
          <a href="#integrate">integrate</a>
          <a href="#editor">editor</a>
        </nav>

        <header id="top" className="hero">
          <p className="kicker">// a pixel friend for your website</p>
          <h1 className="px-title hero-title">mascot</h1>
          <p className="hero-lede">
            A tiny robot that lives on your site. It walks on your layout, follows the cursor, talks about whatever visitors
            point at, naps when they leave, and does whatever your app tells it to.
          </p>
          <MascotSpot home className="card terminal" say={['That is me!', 'Hover things. I talk about them.', 'One install. No dependencies.']}>
            <InstallLine command="npm i mascot" />
          </MascotSpot>
          <div className="hero-cta">
            <a className="px-btn" href="#editor">
              Make your own
            </a>
            <a className="px-link" href="#integrate">
              see the API
            </a>
          </div>
        </header>

        <Section id="spots" n="01" title="Spots & messages" says={['Spots are just elements.', 'I stand on top of things.']}>
          Mark any element as a spot and the mascot can stand on its top edge. Give elements lines and it says them on hover, on
          click, or the first time they scroll into view.
        </Section>
        <div className="grid">
          <MascotSpot spot className="card" say={['React works.', 'Lines can be arrays.']} enter="Scroll down, there is more.">
            <h3>react</h3>
            <pre className="code">{`<MascotSpot spot\n  say={['Hi!', 'Hello']}>\n  ...\n</MascotSpot>`}</pre>
          </MascotSpot>
          <div className="card" data-mascot-spot data-mascot-say="Works without React too.|Just data attributes." data-mascot-click="You clicked the HTML card!">
            <h3>plain html</h3>
            <pre className="code">{`<div data-mascot-spot\n  data-mascot-say="Hi!|Hello"\n  data-mascot-click="Ouch">`}</pre>
          </div>
          <MascotSpot spot className="card" say={() => `It is ${new Date().toLocaleTimeString()}.`} chatter={['I like this card.', 'Nice and flat up here.']}>
            <h3>live lines</h3>
            <pre className="code">{`say={() =>\n  \`It is \${time}\`}`}</pre>
          </MascotSpot>
        </div>

        <Section id="integrate" n="02" title="Plug it into your app" says={['I take orders.', 'Wire me into anything.']}>
          Call it from anywhere, listen to what visitors do with it, or give it a menu of your own actions.
        </Section>
        <div className="grid two">
          <MascotSpot spot className="card">
            <Controls character={character} setCharacter={setCharacter} />
            <Toggles features={features} setFeatures={setFeatures} withMenu={withMenu} setWithMenu={setWithMenu} />
          </MascotSpot>
          <MascotSpot spot className="card" say="Everything I do ends up here.">
            <EventLog />
          </MascotSpot>
        </div>

        <Section id="editor" n="03" title="Make your own" says={['This is where I was born.', 'Paint me a friend.']}>
          A character is a stack of pixel layers. Each layer has frames per pose, so blinking only swaps the eyes and walking only
          animates the legs. Paint one here or import a PNG, try it on the page, then copy the code into your project.
        </Section>
        <MascotSpot spot className="card editor-card" data-no-light>
          <Editor
            onUse={(def, opts) => {
              setCharacter(def)
              if (opts?.scroll !== false) scrollTo({ top: 0 })
            }}
          />
        </MascotSpot>

        <MascotSpot as="footer" spot className="footer" chatter="The floor. My favorite.">
          <span>Grown out of Pix, the robot below the rift on robertskalve.lv.</span>
          <span className="dim">MIT</span>
        </MascotSpot>
      </div>
    </MascotProvider>
  )
}

function InstallLine({ command }: { command: string }) {
  const mascot = useMascot()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      mascot.say('Copied! Paste me anywhere.', 1800)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      mascot.say('Clipboard said no. Select it by hand.', 2200)
    }
  }
  return (
    <>
      <span>
        <span className="prompt">$</span> {command}
        <span className="caret" aria-hidden="true" />
      </span>
      <button type="button" className="px-icon-btn terminal-copy" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${command}`} title="Copy">
        <PixelIcon name={copied ? 'check' : 'copy'} />
      </button>
    </>
  )
}

function Section({ id, n, title, says, children }: { id: string; n: string; title: string; says: string[]; children: ReactNode }) {
  return (
    <header className="section-head">
      <MascotSpot as="h2" spot id={id} className="px-heading" say={says}>
        <span className="num">{n}</span> {title}
      </MascotSpot>
      <p className="lede">{children}</p>
    </header>
  )
}

function Controls({ character, setCharacter }: { character: Character | CharacterDef; setCharacter: (c: Character | CharacterDef) => void }) {
  const mascot = useMascot()
  const [text, setText] = useState('Hello from my app!')
  return (
    <>
      <h3>commands</h3>
      <form
        className="row"
        onSubmit={e => {
          e.preventDefault()
          mascot.say(text)
        }}
      >
        <input value={text} onChange={e => setText(e.target.value)} aria-label="Something to say" />
        <button>say</button>
      </form>
      <div className="row">
        <button onClick={() => mascot.hop()}>hop</button>
        <button onClick={() => mascot.emote('happy', 2000)}>happy</button>
        <button onClick={() => mascot.emote('nervous', 2000)}>nervous</button>
        <button onClick={() => mascot.sleep()}>sleep</button>
        <button onClick={() => mascot.fetch()}>fetch</button>
        <button onClick={() => mascot.goTo('.footer')}>go to footer</button>
      </div>
      <h3>character</h3>
      <div className="row">
        <button className={character === pix ? 'on' : ''} onClick={() => setCharacter(pix)}>
          pix
        </button>
        <button className={character === blob ? 'on' : ''} onClick={() => setCharacter(blob)}>
          blob
        </button>
      </div>
    </>
  )
}

const FEATURES: (keyof Features)[] = ['follow', 'roam', 'drag', 'talk', 'sleep', 'blink', 'particles', 'ball']

function Toggles({
  features,
  setFeatures,
  withMenu,
  setWithMenu,
}: {
  features: Partial<Features>
  setFeatures: (f: Partial<Features>) => void
  withMenu: boolean
  setWithMenu: (v: boolean) => void
}) {
  return (
    <>
      <h3>features</h3>
      <div className="toggles">
        {FEATURES.map(f => (
          <label key={f} className="check">
            <input type="checkbox" checked={features[f] ?? f !== 'ball'} onChange={e => setFeatures({ ...features, [f]: e.target.checked })} /> {f}
          </label>
        ))}
        <label className="check">
          <input type="checkbox" checked={withMenu} onChange={e => setWithMenu(e.target.checked)} /> click = menu
        </label>
      </div>
    </>
  )
}

function EventLog() {
  const [log, setLog] = useState<string[]>([])
  const push = (s: string) => setLog(l => [`${new Date().toLocaleTimeString([], { hour12: false })}  ${s}`, ...l].slice(0, 12))
  useMascotEvent('poke', e => push(`poke #${e.count}`))
  useMascotEvent('grab', () => push('picked up'))
  useMascotEvent('throw', e => push(`thrown at ${Math.round(e.speed)} px/s`))
  useMascotEvent('land', e => push(`landed (${e.count})`))
  useMascotEvent('fetch', e => push(`fetched the ball (${e.count})`))
  useMascotEvent('sleep', () => push('fell asleep'))
  useMascotEvent('wake', e => push(`woke up after ${(e.after / 1000).toFixed(1)}s`))
  useMascotEvent('enter', e => push(`saw "${describe(e.el)}" scroll in`))
  useMascotEvent('menu', e => push(e.open ? 'menu opened' : 'menu closed'))
  return (
    <>
      <h3>events</h3>
      <pre className="code log">{log.length ? log.join('\n') : '> poke it, throw it, or let it nap_'}</pre>
      <pre className="code">{`mascot.on('poke', ({ count }) => {\n  if (count === 10) unlockAchievement()\n})`}</pre>
    </>
  )
}

const describe = (el: Element) => (el.querySelector('h1, h2, h3')?.textContent ?? el.textContent ?? el.tagName.toLowerCase()).trim().slice(0, 30)
