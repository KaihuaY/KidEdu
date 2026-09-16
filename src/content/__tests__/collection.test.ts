// Content checks for the reward collection (see src/content/collection.ts).
// Verifies the catalogue shape another builder's UI relies on, that every
// photo was actually downloaded by scripts/fetch-collection.mjs, and that
// facts/credits meet the kid-facing bar (true, short, licensed).
//
// This is the only src file that touches node:fs, so it pulls in Node's
// ambient types itself rather than widening tsconfig.app.json's `types`
// (which is deliberately just ["vite/client"] for the rest of the app).
/// <reference types="node" />

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RARITIES, type Rarity } from '../../store/progress'
import { COLLECTION, findItem, itemsInSet, RARITY_META, SETS, type CollectionSet } from '../collection'
import { CREDITS } from '../collectionCredits'

// Free-licence codes accepted from Wikimedia Commons. CREDITS stores the
// human-readable LicenseShortName (e.g. "CC BY-SA 3.0", "Public domain"); this
// normalises punctuation/case before matching the same allowlist the fetch
// script applies to the machine-readable License.value code.
const FREE_LICENCE_RE = /^(pd|public-domain|cc0|cc-by(-sa)?-\d)/i
function normaliseLicence(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

// 'where' must start with one of these per set (see SPEC in the task brief).
const WHERE_PREFIXES: Record<CollectionSet, string[]> = {
  gems: ['Found in:'],
  animals: ['Lives in:'],
  space: ['Orbits:', 'Located:'],
}

const SET_SIZE: Record<CollectionSet, number> = { gems: 24, animals: 36, space: 16 }

function sentenceCount(fact: string): number {
  return fact
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean).length
}

function repoPath(...parts: string[]): string {
  return resolve(__dirname, '../../..', ...parts)
}

describe('COLLECTION', () => {
  it('has 76 items total', () => {
    expect(COLLECTION.length).toBe(76)
  })

  it('declares the three sets with the expected sizes', () => {
    expect(SETS.map((s) => s.id)).toEqual(['gems', 'animals', 'space'])
    for (const set of SETS.map((s) => s.id)) {
      expect(itemsInSet(set).length, `${set} size`).toBe(SET_SIZE[set])
    }
  })

  it('has unique ids, all kebab-case', () => {
    const ids = COLLECTION.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('findItem resolves every id and nothing else', () => {
    for (const c of COLLECTION) {
      expect(findItem(c.id)).toBe(c)
    }
    expect(findItem('does-not-exist')).toBeUndefined()
  })

  it('every rarity is a known Rarity', () => {
    for (const c of COLLECTION) {
      expect(RARITIES).toContain(c.rarity)
    }
  })

  it('has a downloaded photo for every item', () => {
    const missing = COLLECTION.filter((c) => !existsSync(repoPath('public', 'collection', `${c.id}.jpg`))).map((c) => c.id)
    expect(missing).toEqual([])
  })

  it('has a fact of exactly two short, true-length sentences', () => {
    for (const c of COLLECTION) {
      expect(c.fact.length, `${c.id} fact length`).toBeLessThanOrEqual(220)
      expect(sentenceCount(c.fact), `${c.id} sentence count: ${c.fact}`).toBe(2)
      expect(c.fact.trim().endsWith('.') || c.fact.trim().endsWith('!') || c.fact.trim().endsWith('?')).toBe(true)
    }
  })

  it('has a where field with the correct prefix for its set', () => {
    for (const c of COLLECTION) {
      const prefixes = WHERE_PREFIXES[c.set]
      expect(prefixes.some((p) => c.where.startsWith(p)), `${c.id} where: ${c.where}`).toBe(true)
    }
  })

  it('has a say hint only as a "Say: ..." string when present', () => {
    for (const c of COLLECTION) {
      if (c.say !== undefined) {
        expect(c.say.startsWith('Say:')).toBe(true)
      }
    }
  })

  it('has a CREDITS entry with a free licence for every item', () => {
    for (const c of COLLECTION) {
      const credit = CREDITS[c.id]
      expect(credit, `${c.id} credit`).toBeDefined()
      expect(credit.author.length).toBeGreaterThan(0)
      expect(normaliseLicence(credit.license), `${c.id} licence: ${credit.license}`).toMatch(FREE_LICENCE_RE)
      expect(credit.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
    }
  })

  it('has roughly the right rarity distribution per set, and exactly one legendary each', () => {
    const targets: Record<CollectionSet, Record<Rarity, number>> = {
      gems: { common: 10, uncommon: 7, rare: 4, epic: 2, legendary: 1 },
      animals: { common: 15, uncommon: 11, rare: 6, epic: 3, legendary: 1 },
      space: { common: 6, uncommon: 5, rare: 3, epic: 1, legendary: 1 },
    }
    for (const set of SETS.map((s) => s.id)) {
      const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }
      for (const c of itemsInSet(set)) counts[c.rarity]++
      expect(counts.legendary, `${set} legendary count`).toBe(1)
      for (const rarity of RARITIES) {
        expect(Math.abs(counts[rarity] - targets[set][rarity]), `${set} ${rarity} count ${counts[rarity]}`).toBeLessThanOrEqual(2)
      }
    }
  })

  it('names the correct legendary item per set', () => {
    expect(itemsInSet('gems').find((c) => c.rarity === 'legendary')?.id).toBe('diamond')
    expect(itemsInSet('animals').find((c) => c.rarity === 'legendary')?.id).toBe('blue-whale')
    expect(itemsInSet('space').find((c) => c.rarity === 'legendary')?.id).toBe('andromeda-galaxy')
  })
})

describe('RARITY_META', () => {
  it('has an entry for every rarity with sensible fields', () => {
    for (const rarity of RARITIES) {
      const meta = RARITY_META[rarity]
      expect(meta).toBeDefined()
      expect(meta.stars).toBeGreaterThanOrEqual(1)
      expect(meta.stars).toBeLessThanOrEqual(5)
      expect(meta.colour).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
