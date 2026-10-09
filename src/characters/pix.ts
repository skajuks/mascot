import { defineCharacter } from '../core/character.js'

// Pix: a 12x12 TV-headed robot with an on-air light. The reference character: a body layer, a
// blinking light, eyes that follow the cursor, and legs with a walk cycle.

const legsDown = `
  ..dd....dd..
  ..dd....dd..`
const rightUp = `
  ..dd....dd..
  ..dd........`
const leftUp = `
  ..dd....dd..
  ........dd..`

export const pix = defineCharacter({
  name: 'Pix',
  palette: {
    b: '#e0704f', // casing
    h: '#f08a68', // knobs
    s: '#141412', // screen
    d: '#8c4a33', // antenna, legs
    e: '#5fd38d', // eyes
    r: '#ff5a4f', // on-air light
  },
  feet: 11,
  layers: [
    {
      name: 'body',
      frames: {
        default: `
          ............
          .....d......
          ..bbbbbbbb..
          .bbbbbbbbbb.
          .bssssssssbh
          .bssssssssb.
          .bssssssssbh
          .bssssssssb.
          .bbbbbbbbbb.`,
      },
    },
    {
      name: 'light',
      at: [5, 0],
      frames: {
        default: { frames: ['r', '.'], durations: [1680, 720] },
        sleep: null,
      },
    },
    {
      name: 'eyes',
      at: [2, 4],
      look: 1,
      frames: {
        default: `
          ........
          .ee..ee.
          .ee..ee.`,
        blink: `
          ........
          ........
          .ee..ee.`,
        dizzy: `
          e.e..e.e
          .e....e.
          e.e..e.e`,
        happy: `
          ........
          .ee..ee.
          e..ee..e`,
      },
    },
    {
      name: 'legs',
      at: [0, 9],
      frames: {
        default: legsDown,
        walk: { frames: [rightUp, legsDown, leftUp, legsDown], fps: 8.3 },
      },
      // Tucked in mid-air, dangling when held.
      offsets: { air: [0, -1], held: [0, 1] },
    },
  ],
  offsets: { sleep: [0, 1], held: [0, 1] },
  fx: {
    trail: ['#e0704f', '#f08a68', '#f2b84b', '#ff5a4f'],
    spark: ['#5fd38d', '#9df0bd', '#f2b84b', '#ecebe3'],
  },
  lines: {
    greet: ['Oh, hi.', 'Welcome in.', 'You found the site.', 'I live here.'],
    poke: ['Hey!', 'That tickles.', 'Ow. Pixels.', 'Stop poking.', 'I bite. Lightly.', 'Again?', 'Fine. Keep going.'],
    wake: ['I was not sleeping.', 'Huh? I am up.', 'Back on air.'],
    held: ['Whoa! Put me down!', 'I am not a toy.', 'Careful!', 'Higher! No, lower!'],
    thrown: ['Wheeeee!', 'Aaaaa!', 'I can fly!'],
    dizzy: ['Never again.', 'Which way is up?', 'Did I stick the landing?', 'Again! No. Wait.'],
    ball: ['Throw it!', 'Fetch? FETCH!', 'Go on, throw it.', 'That is my ball.'],
    chase: ['Mine!', 'Got it, got it!', 'Ooh!', 'I see it!'],
    fetched: ['Again!', 'Fetched.', 'Throw it again!', 'Good human.', 'Best game ever.'],
    giveUp: ["I'm not getting that.", 'Too far. You get it.'],
  },
})
