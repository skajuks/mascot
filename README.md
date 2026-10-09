# mascot

A tiny pixel mascot that lives on your site. It walks along the top edges of your layout, trots after
the cursor, hops to whatever section the visitor is reading, talks about what they point at, naps
when they leave, and does whatever your app tells it to.

Grown out of Pix, the robot on robertskalve.lv. No dependencies; React bindings optional.

```sh
npm i @robertskalve/mascot
npm run dev    # site with a demo page and the character editor (mascot.robertskalve.lv)
```

## Quick start

### Plain JavaScript

```html
<section data-mascot-spot="home" data-mascot-say="Welcome!|Hi there.">...</section>
<section data-mascot-spot data-mascot-enter="These are our prices.">...</section>
```

```js
import { createMascot } from '@robertskalve/mascot'

const mascot = createMascot({ ceiling: 64 }) // 64 = height of a fixed header to stay under
mascot.say('Saved!')
```

### React

```tsx
import { MascotProvider, MascotSpot, useMascot } from '@robertskalve/mascot/react'

<MascotProvider ceiling={64} lines={{ greet: ['Welcome to Acme!'] }}>
  <MascotSpot as="section" home say={['This is the hero.', 'Hover more stuff!']}>...</MascotSpot>
  <MascotSpot as="section" spot enter="Pricing! Exciting." say={() => `${count} plans`}>...</MascotSpot>
  <SaveButton />
</MascotProvider>

function SaveButton() {
  const mascot = useMascot()
  return <button onClick={() => (save(), mascot.say('Saved!'), mascot.emote('happy'))}>Save</button>
}
```

## Spots and messages

A **spot** is any element the mascot can stand on (its top edge). Without spots it has nowhere to
go. Elements can also carry lines for it to say:

| Data attribute         | `attach` / `<MascotSpot>` prop | When                                         |
| ---------------------- | ------------------------------ | -------------------------------------------- |
| `data-mascot-spot`     | `spot` (`home` for the start)  | It can walk here                             |
| `data-mascot-say`      | `say`                          | On hover                                     |
| `data-mascot-enter`    | `enter`                        | Once, the first time it scrolls into view    |
| `data-mascot-click`    | `click`                        | When the element is clicked                  |
| `data-mascot-chatter`  | `chatter`                      | Now and then while standing on it            |

Attributes split lines on `|`. Through props or `mascot.attach(el, config)` a line can also be a
function, so it can use live data: `say={({ count }) => \`${cart.size} items in your cart\`}`.

The mascot's own lines (greet, poke, held, thrown, dizzy, sleep, wake, chatter, chase, fetched,
giveUp, ball) come from the character and can be overridden per site with `lines`.

## Plugging it into your app

```js
mascot.say(text, ms?)        // Infinity keeps it up
mascot.sayOne(['a', 'b'])    // random, never the same twice in a row
mascot.hop()
mascot.goTo('#pricing')      // walk over and stay a while
mascot.emote('happy', 1500)  // swaps layers that have a `happy` frame; sets data-emote for CSS
mascot.sleep() / wake() / fetch() / hush() / show() / hide()
mascot.on('poke', ({ count }) => count === 10 && unlockAchievement())
```

Events: `ready`, `say`, `poke`, `grab`, `throw`, `land`, `sleep`, `wake`, `spot`, `hover`, `enter`,
`click`, `fetch`, `state`, `menu`. In React: `useMascotEvent('poke', e => ...)`.

**Menu.** Give it a menu and clicking the mascot opens it instead of poking. A small way to put
your own features one click away:

```js
createMascot({
  menuTitle: 'Need a hand?',
  menu: [
    { label: 'Search the docs', onSelect: () => openSearch() },
    { label: 'Talk to sales', onSelect: m => (openChat(), m.say('Connecting you!')) },
  ],
})
```

**Plugins** get a per-frame hook and the particle system:

```js
const confetti = (mascot, kit) => {
  const off = mascot.on('land', () => kit.fx?.sparks(mascot.position.x, mascot.position.y, 30))
  return { destroy: off }
}
createMascot({ plugins: [confetti] })
```

**Canvas scenes.** `drawCharacter(ctx, character, x, y, scale, { state, emote, look, t })` draws the
same character on your own canvas, for loaders, games and reveal animations. `Particles` is exported
too.

## Perches

Small extra copies of the mascot that live on elements you pick, at the size you pick. Their feet
go on one edge of the element: standing on the top, hanging upside down from the bottom, or clinging
to a side. Each is clipped at its edge, so the element hides whatever is behind it (that's how
`peek` ducks down) with no z-index work on your side. They glance at a nearby cursor, sometimes say
hi, and hop when clicked.

```html
<div class="pricing" data-mascot-perch="top 80% md wander; right 30% sm peek"
     data-mascot-perch-say="Pick me!|Best plan.">...</div>
```

```tsx
<MascotSpot perch={[{ edge: 'top', at: 0.8, size: 'md', act: 'wander' }, { edge: 'right', at: 0.3, act: 'peek', character: blob }]}>
```

```js
const p = mascot.perch(document.querySelector('.avatar'), { edge: 'top', size: 'xs', act: 'sleep' })
p.say('zzz...'); p.update({ act: 'dance' }); p.remove()
```

| Option      | Values                                          | Default     |
| ----------- | ----------------------------------------------- | ----------- |
| `edge`      | `top`, `bottom`, `left`, `right`                | `top`       |
| `at`        | 0..1 along the edge (attribute: `30%`)          | `0.5`       |
| `size`      | `xs`, `sm`, `md`, `lg` (1-4 px per pixel) or a number (attribute: `3x`) | `sm` |
| `act`       | `idle`, `wander`, `peek`, `sleep`, `dance`      | `idle`      |
| `character` | any character (JS/React only)                   | the page mascot |
| `emote`     | an emote to hold (attribute: any other word)    |             |
| `say`       | lines (attribute: `data-mascot-perch-say`)      | `lines.perch` |

Clicks fire a `perch` event: `mascot.on('perch', ({ el, count }) => ...)`.

## Options

| Option         | Default                | |
| -------------- | ---------------------- | - |
| `character`    | `pix`                  | `pix`, `blob`, or your own |
| `scale`        | character's (4)        | CSS px per pixel |
| `lines`        |                        | Override the mascot's own lines |
| `ceiling`      | `0`                    | Px at the top of the viewport to stay out of |
| `spots`        | `'[data-mascot-spot]'` | Selector for spots |
| `features`     | see below              | |
| `menu`, `menuTitle` |                   | Click menu |
| `sleepAfter`   | `15000`                | ms idle before a nap |
| `chatterEvery` | `25000`                | ms between chatter lines |
| `zIndex`       | `40`                   | |
| `reducedMotion`| OS setting             | No hops, particles or bobbing |

Features (all on except `ball`): `follow`, `roam`, `drag`, `talk`, `sleep`, `blink`, `particles`,
`ball`.

Theme the speech bubble with CSS custom properties on `.mascot`: `--mascot-bubble-bg`,
`--mascot-bubble-fg`, `--mascot-bubble-font`, `--mascot-bubble-size`, `--mascot-bubble-width`,
`--mascot-bubble-shadow`, `--mascot-accent`.

## Making a character

A character is a stack of **layers** drawn back to front. Each layer has **frames per pose**, so a
blink only swaps the eyes and a walk only animates the legs. Frames are char matrices: one char per
pixel, looked up in the palette; anything not in the palette (use `.`) is transparent.

```ts
import { defineCharacter } from '@robertskalve/mascot'

export const bot = defineCharacter({
  name: 'Bot',
  palette: { b: '#e0704f', s: '#141412', e: '#5fd38d', d: '#8c4a33' },
  feet: 11, // grid row the feet stand on
  layers: [
    { name: 'body', frames: { default: `
        ..bbbbbbbb..
        .bssssssssb.
        .bssssssssb.
        .bbbbbbbbbb.` } },
    {
      name: 'eyes', at: [3, 1], look: 1, // shifts 1px toward the cursor
      frames: {
        default: ['ee..ee', 'ee..ee'],
        blink: ['......', 'ee..ee'],
        happy: ['ee..ee', '......'],     // any name works as an emote
      },
    },
    {
      name: 'legs', at: [0, 4],
      frames: {
        default: ['..dd....dd..'],
        walk: { frames: [['..dd........'], ['........dd..']], fps: 8 },
        sleep: null,                     // hidden in this pose
      },
      offsets: { air: [0, -1] },         // tuck up while jumping
    },
  ],
  offsets: { sleep: [0, 1] },            // whole sprite sinks a pixel when asleep
  lines: { greet: ['Beep boop.'] },      // its personality
})
```

Poses: `idle` (`default`), `walk`, `air`, `held`, `dizzy`, `sleep`, plus `blink` and any emote name.
Missing poses fall back: held → air → idle, sleep → blink → idle, everything → default.

Frames can also be images (`{ src, width, height }`, in grid units) for art made elsewhere, and
`matrixFromImage(img)` turns a PNG into a matrix and palette.

The easiest way is the **editor** on the site (`npm run dev`): paint layers and poses, preview
the animation, import a PNG, try it on the page, and copy the code.
