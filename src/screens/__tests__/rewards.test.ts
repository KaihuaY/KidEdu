import { describe, expect, it } from 'vitest'
import {
  maxStars,
  pickWeighted,
  rollTicket,
  starsForTier,
  tierForClimbTries,
  tierForStageTries,
  xpForTier,
} from '../../store/rewards'

describe('tierForStageTries', () => {
  it('1 try is gold', () => {
    expect(tierForStageTries(1)).toBe('gold')
  })
  it('2-3 tries is silver', () => {
    expect(tierForStageTries(2)).toBe('silver')
    expect(tierForStageTries(3)).toBe('silver')
  })
  it('4+ tries is bronze', () => {
    expect(tierForStageTries(4)).toBe('bronze')
    expect(tierForStageTries(100)).toBe('bronze')
  })
})

describe('tierForClimbTries', () => {
  it('exactly 3 (one per run) is gold', () => {
    expect(tierForClimbTries(3)).toBe('gold')
  })
  it('4-6 is silver', () => {
    expect(tierForClimbTries(4)).toBe('silver')
    expect(tierForClimbTries(6)).toBe('silver')
  })
  it('7+ is bronze', () => {
    expect(tierForClimbTries(7)).toBe('bronze')
  })
})

describe('starsForTier / maxStars', () => {
  it('maps tiers to star counts', () => {
    expect(starsForTier('gold')).toBe(3)
    expect(starsForTier('silver')).toBe(2)
    expect(starsForTier('bronze')).toBe(1)
  })
  it('maxStars keeps the best of two ratings', () => {
    expect(maxStars(1, 3)).toBe(3)
    expect(maxStars(2, 0)).toBe(2)
    expect(maxStars(0, 0)).toBe(0)
  })
})

describe('xpForTier', () => {
  it('gold beats silver beats bronze', () => {
    expect(xpForTier('gold')).toBeGreaterThan(xpForTier('silver'))
    expect(xpForTier('silver')).toBeGreaterThan(xpForTier('bronze'))
  })
})

describe('pickWeighted', () => {
  it('returns undefined for an empty list', () => {
    expect(pickWeighted([])).toBeUndefined()
  })

  it('returns undefined when every weight is zero or negative', () => {
    expect(pickWeighted([{ weight: 0 }, { weight: -5 }])).toBeUndefined()
  })

  it('always returns the only positively-weighted item', () => {
    const items = [{ id: 'a', weight: 0 }, { id: 'b', weight: 5 }, { id: 'c', weight: 0 }]
    for (const rng of [() => 0, () => 0.5, () => 0.999999]) {
      expect(pickWeighted(items, rng)?.id).toBe('b')
    }
  })

  it('distributes picks proportionally to weight over many trials', () => {
    const items = [{ id: 'common', weight: 3 }, { id: 'rare', weight: 1 }]
    let rare = 0
    const trials = 4000
    // Deterministic pseudo-random sequence so this never flakes.
    let seed = 42
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < trials; i++) {
      if (pickWeighted(items, rng)?.id === 'rare') rare++
    }
    const fraction = rare / trials
    // Expected 0.25; allow generous slack for pseudo-random noise.
    expect(fraction).toBeGreaterThan(0.15)
    expect(fraction).toBeLessThan(0.35)
  })

  it('respects a rng that lands exactly on the boundary', () => {
    const items = [{ weight: 1 }, { weight: 1 }]
    // rng() * total === 1 lands exactly at the edge of item 0; the loop's
    // `roll <= 0` check must still pick a defined item, not fall through.
    const picked = pickWeighted(items, () => 0.5)
    expect(picked).toBeDefined()
  })
})

describe('rollTicket', () => {
  it('never rolls true at chance 0', () => {
    expect(rollTicket(0, () => 0)).toBe(false)
  })
  it('always rolls true at chance 1 (except rng landing exactly on 1, which never happens from Math.random-style rngs)', () => {
    expect(rollTicket(1, () => 0)).toBe(true)
    expect(rollTicket(1, () => 0.999999)).toBe(true)
  })
  it('clamps out-of-range chances', () => {
    expect(rollTicket(5, () => 0.999999)).toBe(true)
    expect(rollTicket(-5, () => 0)).toBe(false)
  })
})
