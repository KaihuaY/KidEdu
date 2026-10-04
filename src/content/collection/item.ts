// Shared card type and the positional item(...) helper used by every set file.

import type { Rarity } from '../../store/progress'

export type CollectionSet = 'gems' | 'animals' | 'space' | 'birds' | 'butterflies' | 'countries'

export interface CollectionItem {
  id: string
  set: CollectionSet
  name: string
  rarity: Rarity
  emoji: string
  fact: string
  where: string
  say?: string
}

export function item(
  id: string,
  set: CollectionSet,
  name: string,
  rarity: Rarity,
  emoji: string,
  fact: string,
  where: string,
  say?: string,
): CollectionItem {
  return say ? { id, set, name, rarity, emoji, fact, where, say } : { id, set, name, rarity, emoji, fact, where }
}
