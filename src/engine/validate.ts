/**
 * Sanity check a hand-entered cube.
 *
 * The UI lets a grown-up (or Nora) paint the 54 stickers, and people make
 * mistakes: a missing colour, a corner that cannot exist, a piece entered
 * twisted.  Every message here is written to be read out loud to a 6 year old,
 * and `facelets` points at the stickers worth looking at again.
 */

import {
  CENTER_INDICES,
  CORNER_COLORS,
  CORNER_FACELETS,
  EDGE_COLORS,
  EDGE_FACELETS,
  colorName,
  findCornerPiece,
  findEdgePiece,
  pieceName,
} from './pieces'

export type ValidationResult =
  | { ok: true }
  | {
      ok: false
      code:
        | 'length'
        | 'counts'
        | 'centers'
        | 'badPiece'
        | 'duplicatePiece'
        | 'cornerTwist'
        | 'edgeFlip'
        | 'parity'
      message: string
      facelets?: number[]
    }

const LETTERS = ['U', 'R', 'F', 'D', 'L', 'B']
const CENTER_LETTERS = ['U', 'R', 'F', 'D', 'L', 'B']

function fail(
  code: Exclude<Extract<ValidationResult, { ok: false }>['code'], never>,
  message: string,
  facelets?: number[],
): ValidationResult {
  return facelets ? { ok: false, code, message, facelets } : { ok: false, code, message }
}

/** Parity (0 = even, 1 = odd) of a permutation given as slot -> piece. */
function permutationParity(perm: number[]): number {
  const seen = new Array<boolean>(perm.length).fill(false)
  let swaps = 0
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue
    let j = i
    let len = 0
    while (!seen[j]) {
      seen[j] = true
      j = perm[j]
      len++
    }
    swaps += len - 1
  }
  return swaps % 2
}

export function validateFacelets(state: string): ValidationResult {
  /* 1. shape --------------------------------------------------------- */
  if (typeof state !== 'string' || state.length !== 54) {
    const got = typeof state === 'string' ? state.length : 0
    return fail(
      'length',
      `A cube has 54 stickers (9 on each of the 6 sides), but I counted ${got}. Let's fill in every square.`,
    )
  }
  const strange: number[] = []
  for (let i = 0; i < 54; i++) {
    if (!LETTERS.includes(state[i])) strange.push(i)
  }
  if (strange.length > 0) {
    return fail(
      'length',
      "Some squares are still empty or have a colour I don't know. Let's give every square one of the six cube colours.",
      strange,
    )
  }

  /* 2. nine of each colour ------------------------------------------- */
  for (const letter of LETTERS) {
    const spots: number[] = []
    for (let i = 0; i < 54; i++) if (state[i] === letter) spots.push(i)
    if (spots.length !== 9) {
      return fail(
        'counts',
        `I count ${spots.length} ${colorName(letter)} stickers, but a cube has exactly 9 of each colour. Let's look at the ${colorName(letter)} ones again.`,
        spots,
      )
    }
  }

  /* 3. centres never move -------------------------------------------- */
  for (let f = 0; f < 6; f++) {
    const index = CENTER_INDICES[f]
    if (state[index] !== CENTER_LETTERS[f]) {
      return fail(
        'centers',
        `The middle sticker of the ${colorName(CENTER_LETTERS[f])} side should be ${colorName(CENTER_LETTERS[f])}. Middles never move, so that one is in the wrong place.`,
        [index],
      )
    }
  }

  /* 4. every corner and edge has to be a real piece, used exactly once  */
  const cornerPerm: number[] = []
  const cornerOri: number[] = []
  const seenCorners = new Map<number, number>()
  for (let slot = 0; slot < 8; slot++) {
    const facelets = CORNER_FACELETS[slot]
    const letters = facelets.map((i) => state[i])
    const piece = findCornerPiece(letters)
    if (piece < 0) {
      return fail(
        'badPiece',
        `The corner showing ${pieceName(letters)} is not a real cube corner — no corner has those three colours together. Let's check that corner again.`,
        facelets.slice(),
      )
    }
    const twin = seenCorners.get(piece)
    if (twin !== undefined) {
      return fail(
        'duplicatePiece',
        `Two corners both show ${pieceName(CORNER_COLORS[piece])}. A cube only has one of each piece, so one of them is wrong.`,
        CORNER_FACELETS[twin].concat(facelets),
      )
    }
    seenCorners.set(piece, slot)
    cornerPerm.push(piece)
    // Orientation: how far the white/yellow sticker sits from the U/D face.
    let ori = letters.findIndex((c) => c === 'U' || c === 'D')
    if (ori < 0) ori = 0
    cornerOri.push(ori)
  }

  const edgePerm: number[] = []
  const edgeOri: number[] = []
  const seenEdges = new Map<number, number>()
  for (let slot = 0; slot < 12; slot++) {
    const facelets = EDGE_FACELETS[slot]
    const letters = facelets.map((i) => state[i])
    const piece = findEdgePiece(letters)
    if (piece < 0) {
      return fail(
        'badPiece',
        `The edge showing ${pieceName(letters)} is not a real cube edge — no edge has those two colours together. Let's check that edge again.`,
        facelets.slice(),
      )
    }
    const twin = seenEdges.get(piece)
    if (twin !== undefined) {
      return fail(
        'duplicatePiece',
        `Two edges both show ${pieceName(EDGE_COLORS[piece])}. A cube only has one of each piece, so one of them is wrong.`,
        EDGE_FACELETS[twin].concat(facelets),
      )
    }
    seenEdges.set(piece, slot)
    edgePerm.push(piece)
    // Orientation: an edge is "good" when its first (reference) facelet holds a
    // yellow/white sticker, or - for the middle-layer slots that never touch
    // yellow or white - a green/blue one.
    const a = letters[0]
    const b = letters[1]
    let ori: number
    if (a === 'U' || a === 'D') ori = 0
    else if (b === 'U' || b === 'D') ori = 1
    else if (a === 'F' || a === 'B') ori = 0
    else ori = 1
    edgeOri.push(ori)
  }

  /* 5. corner twists have to add up ---------------------------------- */
  const twistSum = cornerOri.reduce((a, b) => a + b, 0) % 3
  if (twistSum !== 0) {
    const twisted: number[] = []
    for (let slot = 0; slot < 8; slot++) if (cornerOri[slot] !== 0) twisted.push(slot)
    const first = twisted[0] ?? 0
    return fail(
      'cornerTwist',
      `The ${pieceName(CORNER_COLORS[cornerPerm[first]])} corner looks twisted. Check that corner again — turn its colours around one step.`,
      CORNER_FACELETS[first].slice(),
    )
  }

  /* 6. ...and so do edge flips --------------------------------------- */
  const flipSum = edgeOri.reduce((a, b) => a + b, 0) % 2
  if (flipSum !== 0) {
    const flipped: number[] = []
    for (let slot = 0; slot < 12; slot++) if (edgeOri[slot] !== 0) flipped.push(slot)
    const first = flipped[0] ?? 0
    return fail(
      'edgeFlip',
      `The ${pieceName(EDGE_COLORS[edgePerm[first]])} edge looks flipped. Check that edge again — swap its two colours around.`,
      EDGE_FACELETS[first].slice(),
    )
  }

  /* 7. corners and edges must be shuffled the same amount ------------- */
  if (permutationParity(cornerPerm) !== permutationParity(edgePerm)) {
    return fail(
      'parity',
      "It looks like two pieces swapped places, which a real cube can't do. Two stickers were probably typed the wrong way round — let's check the cube once more.",
    )
  }

  return { ok: true }
}
