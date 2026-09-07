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
    cw: 'Front turn RIGHT (clockwise)',
    ccw: 'Front turn LEFT',
    double: 'Front turn twice',
  },
  {
    base: 'B',
    cw: 'Back turn LEFT (it is behind, so it looks backwards)',
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
    cw: 'Flip the whole cube UP (the front goes to the top)',
    ccw: 'Flip the whole cube DOWN (the top goes to the front)',
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
}

/** The seven little tricks Nora learns by heart. */
export const NAMED_ALGS: NamedAlg[] = [
  {
    id: 'elevator',
    kidName: 'The Elevator',
    alg: "R U R' U'",
    hint: 'Right side up, top layer left, right side down, top layer right. Do it again and again until the corner rides down into its home.',
  },
  {
    id: 'goRight',
    kidName: 'Send it Right',
    alg: "U R U' R' U' F' U F",
    hint: 'The edge on top wants to go down and to the RIGHT. Push the top away from the slot first, then bring it back.',
  },
  {
    id: 'goLeft',
    kidName: 'Send it Left',
    alg: "U' L' U L U F U' F'",
    hint: 'The mirror of Send it Right: the edge on top wants to go down and to the LEFT.',
  },
  {
    id: 'yellowCross',
    kidName: 'Yellow Cross',
    alg: "F R U R' U' F'",
    hint: 'Dot, then L-shape, then line, then cross. Hold the L in the top-left corner and the line across.',
  },
  {
    id: 'fish',
    kidName: 'The Fish',
    alg: "R U R' U R U2 R'",
    hint: 'Three yellow edges swim around the top while the front one stays home. Turn the top afterwards to line the colours up.',
  },
  {
    id: 'cornerCycle',
    kidName: 'Corner Swap',
    alg: "U R U' L' U R' U' L",
    hint: 'Three corners take a walk around the top while the front-right corner stays home. It tilts them on the way - the Bottom Elevator fixes that afterwards.',
  },
  {
    id: 'cornerTwist',
    kidName: 'Bottom Elevator',
    alg: "R' D' R D",
    hint: 'Hold the corner at the front-right-top. Do Bottom Elevator 2 or 4 times until yellow is on top. The rest of the cube will look messy - do not worry, it fixes itself at the end!',
  },
]

export function namedAlg(id: string): NamedAlg | undefined {
  return NAMED_ALGS.find((a) => a.id === id)
}
