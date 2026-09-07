/**
 * Piece tables shared by the validator and the solver.
 *
 * A 3x3 cube has 8 corner pieces and 12 edge pieces.  Each of them lives in a
 * "slot" made of 2 or 3 facelet positions.  The tables below list those slots
 * in the classic Kociemba order.
 *
 * Corner slots always start with the facelet on the U or D face, and then walk
 * around the corner clockwise (seen from outside that corner).  That ordering
 * is what makes the "twist" bookkeeping in validate.ts work.
 *
 * Edge slots always start with the facelet on the U or D face; for the four
 * middle-layer edges (which touch neither U nor D) they start on the F or B
 * face instead.  That first facelet is the one that decides whether an edge is
 * flipped.
 */

import type { Face } from './cube'

export type Colour = 'U' | 'R' | 'F' | 'D' | 'L' | 'B'

/** Sticker letter -> the colour Nora actually sees on her cube. */
export const COLOR_NAMES: Record<string, string> = {
  U: 'yellow',
  R: 'orange',
  F: 'green',
  D: 'white',
  L: 'red',
  B: 'blue',
}

export function colorName(letter: string): string {
  return COLOR_NAMES[letter] ?? letter
}

/** "white-green-orange" for a list of sticker letters. */
export function pieceName(letters: string[]): string {
  return letters.map(colorName).join('-')
}

export const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'] as const
export const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'] as const

export type CornerName = (typeof CORNER_NAMES)[number]
export type EdgeName = (typeof EDGE_NAMES)[number]

/** Facelet indices of every corner slot, U/D facelet first, then clockwise. */
export const CORNER_FACELETS: number[][] = [
  [8, 9, 20], //  URF : U9 R1 F3
  [6, 18, 38], // UFL : U7 F1 L3
  [0, 36, 47], // ULB : U1 L1 B3
  [2, 45, 11], // UBR : U3 B1 R3
  [29, 26, 15], // DFR: D3 F9 R7
  [27, 44, 24], // DLF: D1 L9 F7
  [33, 53, 42], // DBL: D7 B9 L7
  [35, 17, 51], // DRB: D9 R9 B7
]

/** Facelet indices of every edge slot, "orientation reference" facelet first. */
export const EDGE_FACELETS: number[][] = [
  [5, 10], //  UR : U6 R2
  [7, 19], //  UF : U8 F2
  [3, 37], //  UL : U4 L2
  [1, 46], //  UB : U2 B2
  [32, 16], // DR : D6 R8
  [28, 25], // DF : D2 F8
  [30, 43], // DL : D4 L8
  [34, 52], // DB : D8 B8
  [23, 12], // FR : F6 R4
  [21, 41], // FL : F4 L6
  [50, 39], // BL : B6 L4
  [48, 14], // BR : B4 R6
]

/** The colours of every corner piece, in the same order as CORNER_FACELETS. */
export const CORNER_COLORS: string[][] = CORNER_NAMES.map((n) => n.split(''))

/** The colours of every edge piece, in the same order as EDGE_FACELETS. */
export const EDGE_COLORS: string[][] = EDGE_NAMES.map((n) => n.split(''))

/** Centre facelet of each face, indexed the same way as FACE_ORDER. */
export const CENTERS: Record<Face, number> = { U: 4, R: 13, F: 22, D: 31, L: 40, B: 49 }

export const CENTER_INDICES = [4, 13, 22, 31, 40, 49]

/** Which slot letters sit next to a facelet index (used for messages). */
export function cornerSlotOf(index: number): number {
  return CORNER_FACELETS.findIndex((slot) => slot.includes(index))
}

export function edgeSlotOf(index: number): number {
  return EDGE_FACELETS.findIndex((slot) => slot.includes(index))
}

/** Index of the corner piece whose colours are exactly `letters` (or -1). */
export function findCornerPiece(letters: string[]): number {
  const key = [...letters].sort().join('')
  return CORNER_COLORS.findIndex((c) => [...c].sort().join('') === key)
}

/** Index of the edge piece whose colours are exactly `letters` (or -1). */
export function findEdgePiece(letters: string[]): number {
  const key = [...letters].sort().join('')
  return EDGE_COLORS.findIndex((c) => [...c].sort().join('') === key)
}
