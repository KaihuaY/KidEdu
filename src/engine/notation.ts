/**
 * Kid-friendly names for cube moves.
 *
 * Nora reads "Right side UP", not "R".  Every move token the engine accepts
 * has an entry here, and the wording always describes what her hands do while
 * she holds the cube with yellow on top and green in front.
 */

import { MOVE_NAMES } from './cube'

/** clockwise / counter-clockwise / half turn wording per move family. */
const FAMILIES: Array<{ base: string; cw: string; ccw: string; double: string }> = [
  // Outer faces
  { base: 'R', cw: 'Right side UP', ccw: 'Right side DOWN', double: 'Right side UP twice' },
  { base: 'L', cw: 'Left side DOWN', ccw: 'Left side UP', double: 'Left side DOWN twice' },
  { base: 'U', cw: 'Top layer LEFT', ccw: 'Top layer RIGHT', double: 'Top layer twice' },
  { base: 'D', cw: 'Bottom layer RIGHT', ccw: 'Bottom layer LEFT', double: 'Bottom layer twice' },
  {
    base: 'F',
    cw: 'Front turn RIGHT (like a steering wheel)',
    ccw: 'Front turn LEFT',
    double: 'Front turn twice',
  },
  {
    base: 'B',
    cw: 'Back turn LEFT (it is hiding behind, so it looks backwards)',
    ccw: 'Back turn RIGHT',
    double: 'Back turn twice',
  },

  // Slices
  {
    base: 'M',
    cw: 'Middle column DOWN (follow the left side)',
    ccw: 'Middle column UP',
    double: 'Middle column twice',
  },
  {
    base: 'E',
    cw: 'Middle belt RIGHT (follow the bottom)',
    ccw: 'Middle belt LEFT',
    double: 'Middle belt twice',
  },
  {
    base: 'S',
    cw: 'Middle slice RIGHT (follow the front)',
    ccw: 'Middle slice LEFT',
    double: 'Middle slice twice',
  },

  // Wide turns (two layers at once)
  { base: 'r', cw: 'Right TWO layers UP', ccw: 'Right TWO layers DOWN', double: 'Right TWO layers up twice' },
  { base: 'l', cw: 'Left TWO layers DOWN', ccw: 'Left TWO layers UP', double: 'Left TWO layers down twice' },
  { base: 'u', cw: 'Top TWO layers LEFT', ccw: 'Top TWO layers RIGHT', double: 'Top TWO layers twice' },
  { base: 'd', cw: 'Bottom TWO layers RIGHT', ccw: 'Bottom TWO layers LEFT', double: 'Bottom TWO layers twice' },
  { base: 'f', cw: 'Front TWO layers RIGHT', ccw: 'Front TWO layers LEFT', double: 'Front TWO layers twice' },
  { base: 'b', cw: 'Back TWO layers LEFT', ccw: 'Back TWO layers RIGHT', double: 'Back TWO layers twice' },

  // Whole cube rotations
  {
    base: 'x',
    cw: 'Spin the whole cube UP (the front flips to the top)',
    ccw: 'Spin the whole cube DOWN (the top flips to the front)',
    double: 'Flip the whole cube upside down',
  },
  {
    base: 'y',
    cw: 'Spin the whole cube LEFT (a new side comes to the front)',
    ccw: 'Spin the whole cube RIGHT (a new side comes to the front)',
    double: 'Spin the whole cube all the way around',
  },
  {
    base: 'z',
    cw: 'Tip the whole cube RIGHT (like a big front turn)',
    ccw: 'Tip the whole cube LEFT',
    double: 'Tip the whole cube over twice',
  },
]

/** "Rw" is just another way of writing "r". */
const WIDE_ALIAS: Record<string, string> = {
  Rw: 'r',
  Lw: 'l',
  Uw: 'u',
  Dw: 'd',
  Fw: 'f',
  Bw: 'b',
}

function buildNames(): Record<string, string> {
  const names: Record<string, string> = {}
  for (const family of FAMILIES) {
    names[family.base] = family.cw
    names[family.base + "'"] = family.ccw
    names[family.base + '2'] = family.double
  }
  for (const alias of Object.keys(WIDE_ALIAS)) {
    const base = WIDE_ALIAS[alias]
    names[alias] = names[base]
    names[alias + "'"] = names[base + "'"]
    names[alias + '2'] = names[base + '2']
  }
  return names
}

/** Every move token the engine accepts, spelled out for a 6 year old. */
export const KID_MOVE_NAMES: Record<string, string> = buildNames()

export function describeMove(move: string): string {
  const name = KID_MOVE_NAMES[move]
  if (name) return name
  return `Turn ${move}`
}

/** True when every move the engine knows also has a kid name. */
export function everyMoveHasAName(): boolean {
  return MOVE_NAMES.every((m) => KID_MOVE_NAMES[m] !== undefined)
}

export interface NamedAlg {
  id: string
  kidName: string
  alg: string
  hint: string
  /** An optional "why does this work?" disclosure - intuition only, no group theory. */
  why?: {
    text: string
    say: string
    /** The trick split into 2-4 kid-language pieces (Trick Gym's "why it works" mission, round 13 Phase 3). Each chunk's `moves` concatenate, in order, to exactly `alg`. */
    chunks?: { moves: string; title: string; text: string; say: string }[]
  }
}

/** The seven little tricks Nora learns by heart. */
export const NAMED_ALGS: NamedAlg[] = [
  {
    id: 'elevator',
    kidName: 'The Elevator 🛗',
    alg: "R U R' U'",
    hint: 'Right side up, top layer left, right side down, top layer right. Do it again and again. Watch the corner ride down into its home.',
    why: {
      text: "The corner rides UP the right side, the top turns to move it out of the way, then the right side comes back DOWN. Every other piece ends up back where it was, because each move gets undone.",
      say: 'The corner rides up the right side, the top moves it out of the way, then the right side comes back down. Everything else ends up back where it was.',
      chunks: [
        {
          moves: 'R',
          title: 'Right side UP',
          text: 'The corner rides up the right side, out of its slot.',
          say: 'The corner rides up the right side.',
        },
        {
          moves: 'U',
          title: 'Top turns LEFT',
          text: 'The top slides the corner out of the way.',
          say: 'The top slides the corner out of the way.',
        },
        {
          moves: "R'",
          title: 'Right side DOWN',
          text: 'The right side comes back down. The corner is not on it any more, so the bottom stays safe.',
          say: 'The right side comes back down, and the bottom stays safe.',
        },
        {
          moves: "U'",
          title: 'Top turns RIGHT',
          text: 'The top slides back. Every move got undone, so almost everything is right where it was.',
          say: 'The top slides back, and everything is undone.',
        },
      ],
    },
  },
  {
    id: 'goRight',
    kidName: 'Send it Right ➡️',
    alg: "U R U' R' U' F' U F",
    hint: 'The edge on top wants to go down and to the RIGHT. Push the top away from the slot first, then bring it back home.',
    why: {
      text: 'First we park the edge above its home. Then a little detour: take a corner out, drop the edge in, put the corner back. The bottom never notices.',
      say: 'First we park the edge above its home. Then a little detour: take a corner out, drop the edge in, put the corner back. The bottom never notices.',
      chunks: [
        {
          moves: "U R U' R'",
          title: 'Park it, then one Elevator',
          text: 'The top parks the edge next to its home. Then an Elevator ride lifts a corner out and drops the edge in halfway.',
          say: 'Park the edge, then one Elevator ride lifts a corner out.',
        },
        {
          moves: "U' F' U F",
          title: 'Put the corner back',
          text: 'Now the front does the same kind of trick backwards to slot the corner home again. The bottom never notices.',
          say: 'The front puts the corner back home.',
        },
      ],
    },
  },
  {
    id: 'goLeft',
    kidName: 'Send it Left ⬅️',
    alg: "U' L' U L U F U' F'",
    hint: 'This one is the mirror of Send it Right. The edge on top wants to go down and to the LEFT.',
    why: {
      text: 'First we park the edge above its home. Then a little detour: take a corner out, drop the edge in, put the corner back - the mirror image of Send it Right, on the LEFT side this time. The bottom never notices.',
      say: 'First we park the edge above its home. Then a little detour on the left side: take a corner out, drop the edge in, put the corner back. The bottom never notices.',
      chunks: [
        {
          moves: "U' L' U L",
          title: 'The mirror Elevator, on the LEFT',
          text: 'Same idea as Send it Right, just mirrored: park the edge, lift a corner out on the left, drop the edge in halfway.',
          say: 'The mirror Elevator on the left: park the edge, lift a corner out.',
        },
        {
          moves: "U F U' F'",
          title: 'Put the corner back',
          text: 'The front slots the corner home again. The bottom never notices.',
          say: 'The front puts the corner back home.',
        },
      ],
    },
  },
  {
    id: 'yellowCross',
    kidName: 'Yellow Cross ☀️',
    alg: "F R U R' U' F'",
    hint: 'Dot, then L shape, then line, then cross. Hold the L in the top-left corner, and hold the line going across.',
    why: {
      text: "F opens a door. R U R' U' is one Elevator ride that flips two top edges. F' closes the door so the bottom stays safe.",
      say: 'F opens a door. The Elevator flips two top edges. F backwards closes the door so the bottom stays safe.',
      chunks: [
        {
          moves: 'F',
          title: 'F opens a door',
          text: 'One front turn opens a door so the top edges can flip.',
          say: 'F opens a door.',
        },
        {
          moves: "R U R' U'",
          title: 'One Elevator ride',
          text: 'One Elevator ride flips two top edges over.',
          say: 'One Elevator ride flips two top edges.',
        },
        {
          moves: "F'",
          title: "F' closes the door",
          text: 'The front turns back and closes the door, so the bottom is safe again.',
          say: 'F backwards closes the door.',
        },
      ],
    },
  },
  {
    id: 'fish',
    kidName: 'The Fish 🐟',
    alg: "R U R' U R U2 R'",
    hint: 'Three yellow edges swim around the top while the front one stays home. Turn the top afterwards to line the colours up.',
    why: {
      text: 'Three Elevator-style rides on the same side spin three top edges around like a merry-go-round, and the bottom stays put.',
      say: 'Three Elevator-style rides on the same side spin three top edges around like a merry-go-round, and the bottom stays put.',
      chunks: [
        {
          moves: "R U R'",
          title: 'Ride one',
          text: 'Lift, turn, drop: like an Elevator ride with the last move missing.',
          say: 'Lift, turn, drop - almost an Elevator ride.',
        },
        {
          moves: "U R U2 R'",
          title: 'Ride two, with a double top turn',
          text: 'One more ride with a double top turn. Three yellow edges swim around the top like a merry-go-round, and the bottom stays put.',
          say: 'One more ride with a double top turn spins three edges around.',
        },
      ],
    },
  },
  {
    id: 'cornerCycle',
    kidName: 'Corner Swap 🔄',
    alg: "U R U' L' U R' U' L",
    hint: 'Three corners take a walk around the top while the front-right corner stays home. It tilts them on the way. The Bottom Elevator fixes that afterwards.',
    why: {
      text: 'The right side moves one corner out, the left side moves another corner in. Doing it twice sends the corners around in a circle.',
      say: 'The right side moves one corner out, the left side moves another corner in. Doing it twice sends the corners around in a circle.',
      chunks: [
        {
          moves: "U R U' L'",
          title: 'One corner out, another in',
          text: 'The right side takes one corner out, the left side brings another one in.',
          say: 'The right side takes one corner out, the left side brings one in.',
        },
        {
          moves: "U R' U' L",
          title: 'Both sides go back',
          text: 'Now both sides go back the way they came. Three corners have walked around in a circle, and the bottom never noticed.',
          say: 'Both sides go back, and three corners walk around in a circle.',
        },
      ],
    },
  },
  {
    id: 'cornerTwist',
    kidName: 'Bottom Elevator 🛗',
    alg: "R' D' R D",
    hint: 'Hold the corner at the front-right-top. Do Bottom Elevator 2 or 4 times until yellow is on top. The rest of the cube might look messy. Do not worry, it fixes itself at the end!',
    why: {
      text: 'The Bottom Elevator twists ONE corner a little at a time. It looks like it breaks the bottom, but the top turn brings the next corner and the last rides fix everything.',
      say: 'The Bottom Elevator twists one corner a little at a time. It looks like it breaks the bottom, but the top turn brings the next corner and the last rides fix everything.',
      chunks: [
        {
          moves: "R' D'",
          title: 'Pull it down, slide the bottom',
          text: 'The right side pulls the corner down and the bottom slides across. It LOOKS like the bottom is getting messed up - that is normal!',
          say: 'The right side pulls the corner down and the bottom slides. That is normal.',
        },
        {
          moves: 'R D',
          title: 'Put both back',
          text: 'Both moves go back. The corner comes back twisted one notch, and after the last ride the whole bottom is back to normal.',
          say: 'Both moves go back, and the corner comes back twisted one notch.',
        },
      ],
    },
  },
]

export function namedAlg(id: string): NamedAlg | undefined {
  return NAMED_ALGS.find((a) => a.id === id)
}
