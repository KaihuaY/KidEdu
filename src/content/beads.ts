// The bead catalogue for the bracelet maker (see src/components/BraceletMaker.tsx).
// Beads drop from Blind Boxes (every box gives a few, duplicates of a
// collection card turn into more) and from finishing a song target. Letter
// beads spell the kids' names and are the treats.

import type { Rarity } from '../store/progress'

export type BeadShape = 'round' | 'star' | 'heart' | 'flower' | 'letter'

export interface BeadDef {
  id: string
  name: string
  /** Fill colour (hex). */
  colour: string
  shape: BeadShape
  rarity: Rarity
  /** Only for shape 'letter'. */
  letter?: string
}

function bead(id: string, name: string, colour: string, shape: BeadShape, rarity: Rarity, letter?: string): BeadDef {
  return letter ? { id, name, colour, shape, rarity, letter } : { id, name, colour, shape, rarity }
}

export const BEADS: BeadDef[] = [
  bead('red-round', 'Cherry red', '#e5484d', 'round', 'common'),
  bead('blue-round', 'Sky blue', '#3b82f6', 'round', 'common'),
  bead('yellow-round', 'Sunny yellow', '#facc15', 'round', 'common'),
  bead('green-round', 'Leaf green', '#22c55e', 'round', 'common'),
  bead('pink-round', 'Bubblegum pink', '#f472b6', 'round', 'common'),
  bead('orange-round', 'Tangerine', '#fb923c', 'round', 'common'),
  bead('purple-round', 'Grape purple', '#a855f7', 'round', 'common'),
  bead('white-round', 'Pearl white', '#f8fafc', 'round', 'common'),
  bead('gold-star', 'Gold star', '#f5d90a', 'star', 'uncommon'),
  bead('silver-star', 'Silver star', '#cbd5e1', 'star', 'uncommon'),
  bead('pink-heart', 'Pink heart', '#fb7185', 'heart', 'uncommon'),
  bead('red-heart', 'Ruby heart', '#dc2626', 'heart', 'uncommon'),
  bead('sky-flower', 'Sky flower', '#7dd3fc', 'flower', 'uncommon'),
  bead('lilac-flower', 'Lilac flower', '#c4b5fd', 'flower', 'uncommon'),
  bead('rainbow-round', 'Rainbow swirl', '#ff7eb3', 'round', 'rare'),
  bead('glow-star', 'Glow star', '#a3e635', 'star', 'rare'),
  bead('glitter-heart', 'Glitter heart', '#f0abfc', 'heart', 'rare'),
  bead('sunflower', 'Sunflower', '#fbbf24', 'flower', 'rare'),
  bead('letter-n', 'Letter N', '#fde68a', 'letter', 'epic', 'N'),
  bead('letter-o', 'Letter O', '#fde68a', 'letter', 'epic', 'O'),
  bead('letter-r', 'Letter R', '#fde68a', 'letter', 'epic', 'R'),
  bead('letter-a', 'Letter A', '#fde68a', 'letter', 'epic', 'A'),
  bead('letter-m', 'Letter M', '#fde68a', 'letter', 'epic', 'M'),
  bead('letter-e', 'Letter E', '#fde68a', 'letter', 'epic', 'E'),
  bead('letter-l', 'Letter L', '#fde68a', 'letter', 'epic', 'L'),
  bead('letter-i', 'Letter I', '#fde68a', 'letter', 'epic', 'I'),
]

export function findBead(id: string): BeadDef | undefined {
  return BEADS.find((b) => b.id === id)
}

/** How likely each rarity of bead is when one bead drops. */
export const BEAD_RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 5,
  legendary: 0,
}

/**
 * Rolls `count` random bead ids: first a rarity by BEAD_RARITY_WEIGHTS, then
 * a uniform bead of that rarity. Pure given `rng`.
 */
export function randomBeadIds(count: number, rng: () => number = Math.random): string[] {
  const out: string[] = []
  const total = Object.values(BEAD_RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  for (let i = 0; i < count; i++) {
    let roll = rng() * total
    let rarity: Rarity = 'common'
    for (const [r, w] of Object.entries(BEAD_RARITY_WEIGHTS) as [Rarity, number][]) {
      if (roll < w) {
        rarity = r
        break
      }
      roll -= w
    }
    const pool = BEADS.filter((b) => b.rarity === rarity)
    const pick = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] ?? BEADS[0]
    out.push(pick.id)
  }
  return out
}
