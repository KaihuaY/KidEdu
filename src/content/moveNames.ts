/**
 * Kid-friendly move descriptions for the follow-along mission player.
 *
 * Nora reads "Right side UP", not "R". `describeMove` covers every token
 * `MOVE_NAMES` (src/engine/cube.ts) accepts - the six face turns, the three
 * middle slices, the six wide (two-layer) turns and their "Rw"-style
 * aliases, and the three whole-cube rotations - each with its quarter-turn,
 * counter-quarter-turn and double-turn form.
 *
 * The returned text must never contain the bare notation letter as a
 * standalone word (see __tests__/moveNames.test.ts): every family name below
 * is a short phrase, never a single letter.
 */

import { MOVE_NAMES } from '../engine/cube'

export interface MoveDescription {
  /** Big, friendly move name, e.g. "Right side UP". */
  name: string
  /** Optional extra context shown smaller, e.g. "like a steering wheel". */
  detail?: string
}

interface Family {
  base: string
  cw: string
  ccw: string
  detail?: string
}

/** The six outer face turns. */
const FACE_FAMILIES: Family[] = [
  { base: 'R', cw: 'Right side UP', ccw: 'Right side DOWN' },
  { base: 'L', cw: 'Left side DOWN', ccw: 'Left side UP' },
  { base: 'U', cw: 'Top layer LEFT', ccw: 'Top layer RIGHT' },
  { base: 'D', cw: 'Bottom layer RIGHT', ccw: 'Bottom layer LEFT' },
  { base: 'F', cw: 'Front side RIGHT', ccw: 'Front side LEFT', detail: 'like a steering wheel' },
  { base: 'B', cw: 'Back side turns', ccw: 'Back side turns the other way', detail: "the side you can't see" },
]

/** The three middle-layer slices. */
const SLICE_FAMILIES: Family[] = [
  { base: 'M', cw: 'Middle column DOWN', ccw: 'Middle column UP', detail: 'follows the left side' },
  { base: 'E', cw: 'Middle belt RIGHT', ccw: 'Middle belt LEFT', detail: 'follows the bottom' },
  { base: 'S', cw: 'Middle slice RIGHT', ccw: 'Middle slice LEFT', detail: 'follows the front' },
]

/** Wide (two-layer-at-once) turns. */
const WIDE_FAMILIES: Family[] = [
  { base: 'r', cw: 'Right two layers UP', ccw: 'Right two layers DOWN' },
  { base: 'l', cw: 'Left two layers DOWN', ccw: 'Left two layers UP' },
  { base: 'u', cw: 'Top two layers LEFT', ccw: 'Top two layers RIGHT' },
  { base: 'd', cw: 'Bottom two layers RIGHT', ccw: 'Bottom two layers LEFT' },
  { base: 'f', cw: 'Front two layers RIGHT', ccw: 'Front two layers LEFT' },
  { base: 'b', cw: 'Back two layers LEFT', ccw: 'Back two layers RIGHT' },
]

/** Whole-cube rotations - she turns the entire cube in her hands. */
const ROTATION_FAMILIES: Family[] = [
  { base: 'x', cw: 'Turn the WHOLE cube so the front tips up', ccw: 'Turn the WHOLE cube so the front tips down' },
  { base: 'y', cw: 'Turn the WHOLE cube to the left', ccw: 'Turn the WHOLE cube to the right' },
  {
    base: 'z',
    cw: 'Turn the WHOLE cube so the right side tips to the back',
    ccw: 'Turn the WHOLE cube so the right side tips to the front',
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

function familyEntries(family: Family): Record<string, MoveDescription> {
  return {
    [family.base]: { name: family.cw, detail: family.detail },
    [family.base + "'"]: { name: family.ccw, detail: family.detail },
    [family.base + '2']: { name: `${family.cw} — TWICE`, detail: family.detail },
  }
}

function buildDescriptions(): Record<string, MoveDescription> {
  const out: Record<string, MoveDescription> = {}
  for (const family of [...FACE_FAMILIES, ...SLICE_FAMILIES, ...WIDE_FAMILIES, ...ROTATION_FAMILIES]) {
    Object.assign(out, familyEntries(family))
  }
  for (const [alias, base] of Object.entries(WIDE_ALIAS)) {
    out[alias] = out[base]
    out[alias + "'"] = out[base + "'"]
    out[alias + '2'] = out[base + '2']
  }
  return out
}

/** Every move token the engine accepts, described for a 7 year old. */
export const MOVE_DESCRIPTIONS: Record<string, MoveDescription> = buildDescriptions()

/** True when every token in MOVE_NAMES has a description here. */
export function everyMoveIsDescribed(): boolean {
  return MOVE_NAMES.every((m) => MOVE_DESCRIPTIONS[m] !== undefined)
}

export function describeMove(move: string): MoveDescription {
  return MOVE_DESCRIPTIONS[move] ?? { name: `Turn that side (${move})` }
}
