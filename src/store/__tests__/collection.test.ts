import { beforeEach, describe, expect, it } from 'vitest'
import { getDoc, resetAll } from '../progress'
import {
  BRACELET_SLOTS,
  awardBeads,
  awardItem,
  beadsOn,
  currentBracelet,
  finishBracelet,
  latestFinishedBracelet,
  placeBead,
  scrapBracelet,
  startBracelet,
  totalTrayBeads,
} from '../collection'
import { BEADS, BEAD_RARITY_WEIGHTS, findBead, randomBeadIds } from '../../content/beads'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
  resetAll()
})

describe('collection cards', () => {
  it('records a first drop, then flags duplicates and counts them', () => {
    expect(awardItem('amethyst', 5)).toEqual({ duplicate: false, count: 1 })
    expect(awardItem('amethyst', 9)).toEqual({ duplicate: true, count: 2 })
    expect(getDoc().collection.items).toEqual([{ id: 'amethyst', count: 2, firstAt: 5 }])
  })
})

describe('beads and bracelets', () => {
  it('keeps the tray and the strand consistent while placing, swapping and clearing beads', () => {
    awardBeads(['red-round', 'red-round', 'gold-star'])
    expect(totalTrayBeads()).toBe(3)
    const id = startBracelet('  ')
    expect(currentBracelet()?.name).toBe('My bracelet')
    expect(currentBracelet()?.beads).toHaveLength(BRACELET_SLOTS)

    expect(placeBead(id, 0, 'red-round')).toBe(true)
    expect(placeBead(id, 1, 'red-round')).toBe(true)
    expect(placeBead(id, 2, 'red-round')).toBe(false) // none left in the tray
    expect(totalTrayBeads()).toBe(1)

    // Swapping the bead in slot 0 returns the old one to the tray.
    expect(placeBead(id, 0, 'gold-star')).toBe(true)
    expect(getDoc().collection.beads).toEqual({ 'red-round': 1 })
    expect(placeBead(id, 0, null)).toBe(true)
    expect(getDoc().collection.beads).toEqual({ 'red-round': 1, 'gold-star': 1 })

    expect(placeBead(id, BRACELET_SLOTS, 'red-round')).toBe(false)
    expect(placeBead('nope', 0, 'red-round')).toBe(false)
  })

  it('only finishes with enough beads, then locks the bracelet', () => {
    awardBeads(Array<string>(6).fill('blue-round'))
    const id = startBracelet('Ocean')
    for (let i = 0; i < 5; i++) placeBead(id, i, 'blue-round')
    expect(finishBracelet(id)).toBe(false)
    placeBead(id, 5, 'blue-round')
    expect(finishBracelet(id)).toBe(true)
    expect(latestFinishedBracelet()?.name).toBe('Ocean')
    expect(beadsOn(latestFinishedBracelet()!)).toBe(6)
    expect(placeBead(id, 6, 'blue-round')).toBe(false)
    expect(currentBracelet()).toBeUndefined()
  })

  it('scrapping an unfinished bracelet returns its beads', () => {
    awardBeads(['pink-heart', 'pink-heart'])
    const id = startBracelet('Oops')
    placeBead(id, 3, 'pink-heart')
    scrapBracelet(id)
    expect(getDoc().collection.bracelets).toEqual([])
    expect(getDoc().collection.beads).toEqual({ 'pink-heart': 2 })
  })
})

describe('bead catalogue', () => {
  it('has unique ids, letters for both kids, and every rolled bead exists', () => {
    expect(new Set(BEADS.map((b) => b.id)).size).toBe(BEADS.length)
    for (const l of ['N', 'O', 'R', 'A', 'M', 'E', 'L', 'I']) {
      expect(BEADS.some((b) => b.shape === 'letter' && b.letter === l)).toBe(true)
    }
    let seed = 7
    const rng = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    const ids = randomBeadIds(2000, rng)
    expect(ids).toHaveLength(2000)
    for (const id of ids) expect(findBead(id)).toBeDefined()
    const epic = ids.filter((id) => findBead(id)?.rarity === 'epic').length / 2000
    const total = Object.values(BEAD_RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(Math.abs(epic - BEAD_RARITY_WEIGHTS.epic / total)).toBeLessThan(0.03)
  })
})
