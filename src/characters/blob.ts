import { defineCharacter } from '../core/character.js'

// Blob: a 10x9 slime that squishes instead of walking. Shows a whole-body animation and a layer
// (the mouth) that only appears for one emote.

const round = `
  ..........
  ...kkkk...
  ..kggggk..
  .kgghgggk.
  .kghggggk.
  kggggggggk
  kggggggggk
  kggggggggk
  .kkkkkkkk.`
const squished = `
  ..........
  ..........
  ..kkkkkk..
  .kgghgggk.
  kghgggggk.
  kggggggggk
  kggggggggk
  kggggggggk
  .kkkkkkkk.`

export const blob = defineCharacter({
  name: 'Blob',
  palette: {
    k: '#1f4d2b',
    g: '#5fd38d',
    h: '#c8f7d8',
    e: '#10261a',
  },
  scale: 4,
  layers: [
    {
      name: 'body',
      frames: {
        default: round,
        walk: { frames: [round, squished], fps: 6 },
        sleep: squished,
        held: round,
      },
    },
    {
      name: 'eyes',
      at: [3, 4],
      look: 1,
      frames: {
        default: `
          e..e
          e..e`,
        blink: `
          ....
          e..e`,
        dizzy: `
          e..e
          ....`,
        happy: `
          ....
          e..e`,
      },
    },
    {
      name: 'mouth',
      at: [3, 6],
      frames: {
        happy: `
          e..e
          .ee.`,
      },
    },
  ],
  offsets: { held: [0, -1] },
  fx: { trail: ['#5fd38d', '#9df0bd', '#c8f7d8'] },
  lines: {
    greet: ['Blorp!', 'Hello, solid person.'],
    poke: ['Squish!', 'Blorp.', 'I am mostly water.', 'Wobble wobble.'],
    held: ['I might drip.', 'Gentle!'],
    dizzy: ['I am a puddle now.', 'Reassembling...'],
  },
})
