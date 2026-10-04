import type { CollectionItem } from './item'
// import { item } from './item'

// Birds: target 24 cards.
// Card rules (enforced by src/content/__tests__/collection.test.ts):
//  - id: kebab-case, unique, and equal to the photo file name public/collection/<id>.jpg
//  - fact: exactly 2 sentences, at most 220 characters, true and kid-friendly
//  - say: optional pronunciation hint, must start with "Say:"
//  - exactly one legendary in the set
//  - rarity mix about 40% common, 28% uncommon, 18% rare, 10% epic, 1 legendary
//  - every card needs a Commons source in scripts/collection-sources/<set>.json
//    (find one with scripts/find-commons.mjs, then run scripts/fetch-collection.mjs <id>)
//  - where: "Lives in: <places>"

export const BIRDS: CollectionItem[] = []
