// The reward collection: themed sets of real photo cards with a rarity and a
// true fact to learn. Each set lives in src/content/collection/<set>.ts;
// photos live in public/collection/<id>.jpg, fetched by
// scripts/fetch-collection.mjs from scripts/collection-sources/*.json; credits
// are generated into src/content/collectionCredits.ts. This module is the
// public contract: COLLECTION, SETS, findItem, itemsInSet, itemImageUrl and
// RARITY_META.

import type { Rarity } from '../store/progress'
import { ANIMALS } from './collection/animals'
import { BIRDS } from './collection/birds'
import { BUTTERFLIES } from './collection/butterflies'
import { COUNTRIES } from './collection/countries'
import { GEMS } from './collection/gems'
import { SPACE } from './collection/space'
import type { CollectionItem, CollectionSet } from './collection/item'

export type { CollectionItem, CollectionSet }

export const SETS: { id: CollectionSet; name: string; emoji: string }[] = [
  { id: 'gems', name: 'Gems & minerals', emoji: '💎' },
  { id: 'animals', name: 'Animals', emoji: '🦊' },
  { id: 'space', name: 'Space', emoji: '🪐' },
  { id: 'birds', name: 'Birds', emoji: '🐦' },
  { id: 'butterflies', name: 'Butterflies & moths', emoji: '🦋' },
  { id: 'countries', name: 'Countries', emoji: '🌍' },
]

export const COLLECTION: CollectionItem[] = [...GEMS, ...ANIMALS, ...SPACE, ...BIRDS, ...BUTTERFLIES, ...COUNTRIES]

export function findItem(id: string): CollectionItem | undefined {
  return COLLECTION.find((c) => c.id === id)
}

export function itemsInSet(set: CollectionSet): CollectionItem[] {
  return COLLECTION.filter((c) => c.set === set)
}

export function itemImageUrl(item: CollectionItem): string {
  return `${import.meta.env.BASE_URL}collection/${item.id}.jpg`
}

export const RARITY_META: Record<Rarity, { label: string; stars: number; colour: string }> = {
  common: { label: 'Common', stars: 1, colour: '#9ca3af' },
  uncommon: { label: 'Uncommon', stars: 2, colour: '#22c55e' },
  rare: { label: 'Rare', stars: 3, colour: '#3b82f6' },
  epic: { label: 'Epic', stars: 4, colour: '#a855f7' },
  legendary: { label: 'Legendary', stars: 5, colour: '#f5b301' },
}
