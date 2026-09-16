import { describe, expect, it } from 'vitest'
import {
  BEAD_DROPS,
  DUP_BEADS_BY_RARITY,
  RARITY_WEIGHTS,
  formatCents,
  maxStars,
  pickItem,
  pickWeighted,
  rollBoxContents,
  rollCashCents,
  rollRarity,
  rollTicket,
  starsForTier,
  tierForClimbTries,
  tierForStageTries,
  xpForTier,
  type Tier,
} from '../../store/rewards'
import { COLLECTION, type CollectionItem } from '../../content/collection'
import { RARITIES, type OwnedItem, type Prize, type Rarity } from '../../store/progress'

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

describe('rollCashCents', () => {
  const goldCash: Prize = { id: 'gold-cash', name: 'Cash surprise', emoji: '💵', weight: 1, kind: 'cash', minCents: 25, maxCents: 100 }
  const silverCash: Prize = { id: 'silver-cash', name: 'Cash surprise', emoji: '💵', weight: 1, kind: 'cash', minCents: 5, maxCents: 100 }

  it('stays within [minCents, maxCents] and lands on a 5-cent step over many rolls', () => {
    let seed = 7
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < 500; i++) {
      const cents = rollCashCents(goldCash, rng)
      expect(cents).toBeGreaterThanOrEqual(25)
      expect(cents).toBeLessThanOrEqual(100)
      expect(cents % 5).toBe(0)
    }
    for (let i = 0; i < 500; i++) {
      const cents = rollCashCents(silverCash, rng)
      expect(cents).toBeGreaterThanOrEqual(5)
      expect(cents).toBeLessThanOrEqual(100)
      expect(cents % 5).toBe(0)
    }
  })

  it('never exceeds the $1 hard limit even if a prize is misconfigured with a higher max', () => {
    const bogus: Prize = { id: 'bogus', name: 'Cash surprise', emoji: '💵', weight: 1, kind: 'cash', minCents: 500, maxCents: 1000 }
    expect(rollCashCents(bogus, () => 1)).toBe(100)
    expect(rollCashCents(bogus, () => 0)).toBe(100)
  })

  it('clamps a negative minCents down to 0', () => {
    const bogus: Prize = { id: 'bogus', name: 'Cash surprise', emoji: '💵', weight: 1, kind: 'cash', minCents: -50, maxCents: 10 }
    expect(rollCashCents(bogus, () => 0)).toBeGreaterThanOrEqual(0)
  })

  it('falls back to the 5-100 cent default range when min/max are omitted', () => {
    const noRange: Prize = { id: 'x', name: 'Cash surprise', emoji: '💵', weight: 1, kind: 'cash' }
    for (const rng of [() => 0, () => 0.5, () => 1]) {
      const cents = rollCashCents(noRange, rng)
      expect(cents).toBeGreaterThanOrEqual(5)
      expect(cents).toBeLessThanOrEqual(100)
    }
  })
})

describe('formatCents', () => {
  it('formats whole and fractional dollar amounts', () => {
    expect(formatCents(65)).toBe('$0.65')
    expect(formatCents(100)).toBe('$1.00')
    expect(formatCents(5)).toBe('$0.05')
    expect(formatCents(0)).toBe('$0.00')
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

// Deterministic pseudo-random sequence so the distribution tests below never flake.
function seededRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

describe('rollRarity', () => {
  const TIERS: Tier[] = ['gold', 'silver', 'bronze']

  it('only ever rolls a rarity with positive weight for the tier', () => {
    for (const tier of TIERS) {
      const rng = seededRng(tier.length * 17 + 3)
      for (let i = 0; i < 2000; i++) {
        const rarity = rollRarity(tier, rng)
        expect(RARITY_WEIGHTS[tier][rarity]).toBeGreaterThan(0)
      }
    }
  })

  it('matches RARITY_WEIGHTS within +/-3 percentage points over 10k rolls, per tier', () => {
    for (const tier of TIERS) {
      const weights = RARITY_WEIGHTS[tier]
      const total = RARITIES.reduce((sum, r) => sum + weights[r], 0)
      const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }
      const rng = seededRng(1000 + tier.length)
      const trials = 10000
      for (let i = 0; i < trials; i++) counts[rollRarity(tier, rng)]++

      for (const r of RARITIES) {
        const expectedPct = (weights[r] / total) * 100
        const actualPct = (counts[r] / trials) * 100
        expect(Math.abs(actualPct - expectedPct)).toBeLessThanOrEqual(3)
      }
    }
  })
})

function fakeItem(id: string, rarity: Rarity): CollectionItem {
  return { id, set: 'gems', name: id, rarity, emoji: '💎', fact: 'fact', where: 'where' }
}

describe('pickItem', () => {
  const items = [fakeItem('a', 'common'), fakeItem('b', 'common'), fakeItem('c', 'rare')]

  it('picks uniformly among items of the requested rarity', () => {
    const counts = { a: 0, b: 0 }
    const rng = seededRng(55)
    for (let i = 0; i < 4000; i++) {
      const picked = pickItem(items, 'common', [], rng)
      expect(picked?.rarity).toBe('common')
      if (picked?.id === 'a' || picked?.id === 'b') counts[picked.id]++
    }
    expect(counts.a / 4000).toBeGreaterThan(0.35)
    expect(counts.a / 4000).toBeLessThan(0.65)
  })

  it('never returns an excluded id when an alternative of that rarity exists', () => {
    const rng = seededRng(9)
    for (let i = 0; i < 500; i++) {
      expect(pickItem(items, 'common', ['a'], rng)?.id).toBe('b')
    }
  })

  it('falls back to the nearest lower rarity when the requested one has no items', () => {
    // 'epic' and 'legendary' have no items at all here - should fall back
    // down to 'rare' (the nearest rarity below epic that has one).
    expect(pickItem(items, 'epic')?.rarity).toBe('rare')
    expect(pickItem(items, 'legendary')?.rarity).toBe('rare')
  })

  it('falls back to any item when the requested rarity and everything below it is excluded or empty', () => {
    // Only 'rare' item is excluded, and there is nothing at/under 'rare'
    // available - still returns something rather than undefined.
    expect(pickItem([fakeItem('only-rare', 'rare')], 'rare', ['only-rare'])?.id).toBe('only-rare')
  })

  it('returns undefined for a genuinely empty item list', () => {
    expect(pickItem([], 'common')).toBeUndefined()
  })
})

describe('rollBoxContents', () => {
  it('never drops the same card twice in a row across many rolls, for every tier', () => {
    const TIERS_TO_CHECK: Tier[] = ['gold', 'silver', 'bronze']
    for (const tier of TIERS_TO_CHECK) {
      const rng = seededRng(tier.length * 31 + 7)
      let lastId: string | undefined
      for (let i = 0; i < 2000; i++) {
        const result = rollBoxContents(tier, [], lastId, rng)
        if (lastId !== undefined) expect(result.item.id).not.toBe(lastId)
        lastId = result.item.id
      }
    }
  })

  it('drops a bead count within the tier range when the card is not a duplicate', () => {
    const rng = seededRng(3)
    const [min, max] = BEAD_DROPS.bronze
    for (let i = 0; i < 200; i++) {
      const result = rollBoxContents('bronze', [], undefined, rng)
      if (result.duplicate) continue
      expect(result.beadIds.length).toBeGreaterThanOrEqual(min)
      expect(result.beadIds.length).toBeLessThanOrEqual(max)
    }
  })

  it('adds DUP_BEADS_BY_RARITY[rarity] extra beads on top of the normal drop for a duplicate', () => {
    const rng = seededRng(21)
    let checkedADuplicate = false
    for (let i = 0; i < 500; i++) {
      // Force every roll to be a duplicate by pretending she already owns every card.
      const owned: OwnedItem[] = COLLECTION.map((c) => ({ id: c.id, count: 1, firstAt: 0 }))
      const result = rollBoxContents('gold', owned, undefined, rng)
      expect(result.duplicate).toBe(true)
      const [min, max] = BEAD_DROPS.gold
      const extra = DUP_BEADS_BY_RARITY[result.rarity]
      expect(result.beadIds.length).toBeGreaterThanOrEqual(min + extra)
      expect(result.beadIds.length).toBeLessThanOrEqual(max + extra)
      checkedADuplicate = true
    }
    expect(checkedADuplicate).toBe(true)
  })

  it('picks a real card from the collection catalogue', () => {
    const result = rollBoxContents('silver', [], undefined, seededRng(4))
    expect(COLLECTION.some((c) => c.id === result.item.id)).toBe(true)
  })
})
