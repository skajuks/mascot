import { useState } from 'react'
import { blob, pix, type Character, type CharacterDef, type Features } from 'mascot'
import { MascotProvider, MascotSpot, useMascot, useMascotEvent } from 'mascot/react'
import { Editor } from './Editor'

const NAV_HEIGHT = 56

export function App() {
  const [character, setCharacter] = useState<Character | CharacterDef>(pix)
  const [features, setFeatures] = useState<Partial<Features>>({ ball: true })
  const [withMenu, setWithMenu] = useState(false)
  const [dark, setDark] = useState(true)

  return (
    <MascotProvider
      character={character}
      features={features}
      ceiling={NAV_HEIGHT}
      menuTitle="What can I do for you?"
      menu={
        withMenu
          ? [
              { label: dark ? 'Lights on' : 'Lights off', onSelect: m => (setDark(d => !d), m.say(dark ? 'Too bright!' : 'Cozy.')) },
              { label: 'Take me to the editor', onSelect: m => (document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' }), m.say('Make me a friend!')) },
              { label: 'Back to top', onSelect: () => scrollTo({ top: 0, behavior: 'smooth' }) },
              { label: 'Tell me a joke', onSelect: m => m.sayOne(['I would tell a UDP joke, but you might not get it.', 'There are 10 kinds of mascots.', 'My favorite color is #e0704f.'], 4000) },
            ]
          : undefined
      }
    >
      <div className={`page ${dark ? 'dark' : 'light'}`}>
        <nav className="nav" style={{ height: NAV_HEIGHT }}>
          <strong className="logo">mascot</strong>
          <a href="#spots">Spots</a>
          <a href="#integrate">Integrate</a>
          <a href="#editor">Editor</a>
        </nav>

        <header className="hero">
          <MascotSpot home className="card hero-card" say={['That is me!', 'Hover things. I talk about them.']}>
            <h1>A tiny mascot that lives on your site.</h1>
            <p>
              It walks on your layout, follows the cursor, talks about whatever visitors point at, naps when they leave, and
              does whatever your app tells it to.
            </p>
            <pre className="code">npm i mascot</pre>
          </MascotSpot>
        </header>

        <section id="spots" className="section">
          <h2>Spots and messages</h2>
          <p className="lede">
            Mark any element as a spot and the mascot can stand on its top edge. Give elements lines and it says them on
            hover, on click, or the first time they scroll into view.
          </p>
          <div className="grid">
            <MascotSpot spot className="card" say={['Spots are just elements.', 'I stand on the top edge.']} enter="Scroll down, there is more.">
              <h3>React</h3>
              <pre className="code">{`<MascotSpot spot say={['Hi!']}>\n  ...\n</MascotSpot>`}</pre>
            </MascotSpot>
            <div className="card" data-mascot-spot data-mascot-say="Works without React too.|Just data attributes." data-mascot-click="You clicked the HTML card!">
              <h3>Plain HTML</h3>
              <pre className="code">{`<div data-mascot-spot\n  data-mascot-say="Hi!|Hello">`}</pre>
            </div>
            <MascotSpot spot className="card" say={() => `It is ${new Date().toLocaleTimeString()}.`} chatter={['I like this card.', 'Nice and flat up here.']}>
              <h3>Dynamic lines</h3>
              <pre className="code">{`say={() => \`It is \${time}\`}`}</pre>
            </MascotSpot>
          </div>
        </section>

        <section id="integrate" className="section">
          <h2>Plug it into your app</h2>
          <p className="lede">Call it from anywhere, listen to what visitors do with it, or give it a menu of your own actions.</p>
          <div className="grid two">
            <MascotSpot spot className="card">
              <Controls character={character} setCharacter={setCharacter} />
              <Toggles features={features} setFeatures={setFeatures} withMenu={withMenu} setWithMenu={setWithMenu} />
            </MascotSpot>
            <MascotSpot spot className="card" say="Everything I do ends up here.">
              <EventLog />
            </MascotSpot>
          </div>
        </section>

        <section id="editor" className="section">
          <h2>Make your own</h2>
          <p className="lede">
            A character is a stack of pixel layers. Each layer has frames per pose, so blinking only swaps the eyes and walking
            only animates the legs. Paint one here, or import a PNG, then drop the code into your project.
          </p>
          <MascotSpot spot className="card" enter="This is where I was born.">
            <Editor
              onUse={def => {
                setCharacter(def)
                scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          </MascotSpot>
        </section>

        <MascotSpot as="footer" spot className="footer" chatter="The floor. My favorite.">
          Built from Pix, the robot that lives on robertskalve.lv.
        </MascotSpot>
      </div>
    </MascotProvider>
  )
}

function Controls({ character, setCharacter }: { character: Character | CharacterDef; setCharacter: (c: Character | CharacterDef) => void }) {
  const mascot = useMascot()
  const [text, setText] = useState('Hello from my app!')
  return (
    <>
      <h3>Commands</h3>
      <form
        className="row"
        onSubmit={e => {
          e.preventDefault()
          mascot.say(text)
        }}
      >
        <input value={text} onChange={e => setText(e.target.value)} aria-label="Something to say" />
        <button>Say</button>
      </form>
      <div className="row">
        <button onClick={() => mascot.hop()}>Hop</button>
        <button onClick={() => mascot.emote('happy', 2000)}>Happy</button>
        <button onClick={() => mascot.emote('nervous', 2000)}>Nervous</button>
        <button onClick={() => mascot.sleep()}>Sleep</button>
        <button onClick={() => mascot.fetch()}>Fetch</button>
        <button onClick={() => mascot.goTo('.footer')}>Go to footer</button>
      </div>
      <h3>Character</h3>
      <div className="row">
        <button className={character === pix ? 'on' : ''} onClick={() => setCharacter(pix)}>Pix</button>
        <button className={character === blob ? 'on' : ''} onClick={() => setCharacter(blob)}>Blob</button>
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
      <h3>Features</h3>
      <div className="toggles">
        {FEATURES.map(f => (
          <label key={f}>
            <input type="checkbox" checked={features[f] ?? f !== 'ball'} onChange={e => setFeatures({ ...features, [f]: e.target.checked })} /> {f}
          </label>
        ))}
        <label>
          <input type="checkbox" checked={withMenu} onChange={e => setWithMenu(e.target.checked)} /> click opens a menu
        </label>
      </div>
    </>
  )
}

function EventLog() {
  const [log, setLog] = useState<string[]>([])
  const push = (s: string) => setLog(l => [`${new Date().toLocaleTimeString()}  ${s}`, ...l].slice(0, 12))
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
      <h3>Events</h3>
      <pre className="code log">{log.length ? log.join('\n') : 'Poke it, throw it, or let it nap...'}</pre>
      <pre className="code">{`mascot.on('poke', ({ count }) => {\n  if (count === 10) unlockAchievement()\n})`}</pre>
    </>
  )
}

const describe = (el: Element) => (el.querySelector('h1, h2, h3')?.textContent ?? el.tagName.toLowerCase()).slice(0, 30)
