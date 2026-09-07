// Pure, easily-testable helpers behind the reward economy (tokens, tiers,
// weighted prize/sticker picking, ticket rolls). Kept free of the progress
// store and any React so BlindBox.tsx, Lesson.tsx and SolveLog.tsx can all
// share the exact same rules, and so they're trivial to unit test.

export type Tier = 'gold' | 'silver' | 'bronze'

export const TIERS: Tier[] = ['gold', 'silver', 'bronze']

/** How many tries it takes to earn each medal for a Watch/Try/Spot stage. */
export function tierForStageTries(tries: number): Tier {
  if (tries <= 1) return 'gold'
  if (tries <= 3) return 'silver'
  return 'bronze'
}

/** How many total tries (summed across all 3 runs) earn each medal for Climb. */
export function tierForClimbTries(totalTries: number): Tier {
  if (totalTries <= 3) return 'gold'
  if (totalTries <= 6) return 'silver'
  return 'bronze'
}

export function starsForTier(tier: Tier): 1 | 2 | 3 {
  if (tier === 'gold') return 3
  if (tier === 'silver') return 2
  return 1
}

/** Best (numerically highest) of two star ratings - used when merging into StageProgress. */
export function maxStars(a: 0 | 1 | 2 | 3, b: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  return (a > b ? a : b) as 0 | 1 | 2 | 3
}

export interface Weighted {
  weight: number
}

/**
 * Picks one item from `items` with probability proportional to its `weight`.
 * Negative/zero weights are treated as zero. Returns undefined only if there
 * is nothing pickable (empty list or every weight <= 0).
 */
export function pickWeighted<T extends Weighted>(
  items: readonly T[],
  rng: () => number = Math.random,
): T | undefined {
  const weights = items.map((item) => Math.max(0, item.weight))
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (items.length === 0 || total <= 0) return undefined

  let roll = rng() * total
  for (let i = 0; i < items.length; i++) {
    if (roll < weights[i]) return items[i]
    roll -= weights[i]
  }
  // Floating point rounding can leave a hair of `roll` >= 0 after the loop;
  // the last item with positive weight is the correct fallback.
  for (let i = items.length - 1; i >= 0; i--) {
    if (weights[i] > 0) return items[i]
  }
  return undefined
}

/** Whether opening a box of this tier also produces a prize ticket. */
export function rollTicket(chance: number, rng: () => number = Math.random): boolean {
  return rng() < Math.max(0, Math.min(1, chance))
}

/** XP awarded for finishing a stage, scaled by how well it went. */
export function xpForTier(tier: Tier): number {
  if (tier === 'gold') return 30
  if (tier === 'silver') return 20
  return 10
}
