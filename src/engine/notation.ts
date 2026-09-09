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
  why?: { text: string; say: string }
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
    },
  },
]

export function namedAlg(id: string): NamedAlg | undefined {
  return NAMED_ALGS.find((a) => a.id === id)
}
