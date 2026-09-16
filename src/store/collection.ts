// Actions on the `collection` section of the ProgressDoc: the photo cards
// she owns, the loose beads in her tray and her bracelets. Thin wrappers
// around `update()` (same shape as src/store/piano.ts) plus one React hook.
// Which card a box holds, and how many beads it gives, is decided by the
// callers (BlindBox / song targets) with the pure helpers in
// src/store/rewards.ts; this module only keeps the counts consistent.

import { getDoc, update, useProgress, type Bracelet, type CollectionSection, type OwnedItem } from './progress'

/** Slots along one bracelet strand. */
export const BRACELET_SLOTS = 18

/** A bracelet can be finished once it has at least this many beads on it. */
export const MIN_BEADS_TO_FINISH = 6

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useCollection(): CollectionSection {
  return useProgress().collection
}

export function ownedItem(id: string, collection: CollectionSection = getDoc().collection): OwnedItem | undefined {
  return collection.items.find((i) => i.id === id)
}

/** Loose beads in the tray, as an ordered list of [beadId, count] with zero counts dropped. */
export function trayBeads(collection: CollectionSection = getDoc().collection): [string, number][] {
  return Object.entries(collection.beads).filter(([, n]) => n > 0)
}

export function totalTrayBeads(collection: CollectionSection = getDoc().collection): number {
  return trayBeads(collection).reduce((sum, [, n]) => sum + n, 0)
}

/**
 * Records a collection card drop. Returns whether it was a duplicate (so the
 * caller can turn it into beads) and the new count.
 */
export function awardItem(id: string, at: number = Date.now()): { duplicate: boolean; count: number } {
  const existing = ownedItem(id)
  const count = (existing?.count ?? 0) + 1
  update('collection', (c) => ({
    ...c,
    items: existing
      ? c.items.map((i) => (i.id === id ? { ...i, count } : i))
      : [...c.items, { id, count: 1, firstAt: at }],
  }))
  return { duplicate: Boolean(existing), count }
}

/** Adds beads to the tray (duplicate ids add up). No-op for an empty list. */
export function awardBeads(ids: string[]): void {
  if (ids.length === 0) return
  update('collection', (c) => {
    const beads = { ...c.beads }
    for (const id of ids) beads[id] = (beads[id] ?? 0) + 1
    return { ...c, beads }
  })
}

/** Starts a new, empty bracelet and returns its id. */
export function startBracelet(name: string): string {
  const id = uid()
  update('collection', (c) => ({
    ...c,
    bracelets: [
      ...c.bracelets,
      { id, name: name.trim() || 'My bracelet', beads: Array<string | null>(BRACELET_SLOTS).fill(null), startedAt: Date.now() },
    ],
  }))
  return id
}

export function renameBracelet(id: string, name: string): void {
  const next = name.trim()
  if (!next) return
  update('collection', (c) => ({
    ...c,
    bracelets: c.bracelets.map((b) => (b.id === id ? { ...b, name: next } : b)),
  }))
}

/**
 * Puts `beadId` (from the tray) into `slot` of an unfinished bracelet, or
 * clears the slot when `beadId` is null. Whatever was in the slot goes back
 * to the tray. Returns false and changes nothing when the bead is not in the
 * tray, the slot is out of range, or the bracelet is finished/unknown.
 */
export function placeBead(braceletId: string, slot: number, beadId: string | null): boolean {
  const c = getDoc().collection
  const bracelet = c.bracelets.find((b) => b.id === braceletId)
  if (!bracelet || bracelet.finishedAt) return false
  if (!Number.isInteger(slot) || slot < 0 || slot >= bracelet.beads.length) return false
  if (beadId !== null && (c.beads[beadId] ?? 0) <= 0) return false
  const previous = bracelet.beads[slot]
  if (previous === beadId) return true

  update('collection', (current) => {
    const beads = { ...current.beads }
    if (previous) beads[previous] = (beads[previous] ?? 0) + 1
    if (beadId) beads[beadId] = (beads[beadId] ?? 0) - 1
    for (const key of Object.keys(beads)) if (beads[key] <= 0) delete beads[key]
    return {
      ...current,
      beads,
      bracelets: current.bracelets.map((b) =>
        b.id === braceletId ? { ...b, beads: b.beads.map((v, i) => (i === slot ? beadId : v)) } : b,
      ),
    }
  })
  return true
}

export function beadsOn(bracelet: Bracelet): number {
  return bracelet.beads.filter((b) => b !== null).length
}

/** Locks a bracelet once it has enough beads. Returns false (no change) otherwise. */
export function finishBracelet(id: string): boolean {
  const bracelet = getDoc().collection.bracelets.find((b) => b.id === id)
  if (!bracelet || bracelet.finishedAt || beadsOn(bracelet) < MIN_BEADS_TO_FINISH) return false
  update('collection', (c) => ({
    ...c,
    bracelets: c.bracelets.map((b) => (b.id === id ? { ...b, finishedAt: Date.now() } : b)),
  }))
  return true
}

/** Deletes an unfinished bracelet, returning its beads to the tray. */
export function scrapBracelet(id: string): void {
  const bracelet = getDoc().collection.bracelets.find((b) => b.id === id)
  if (!bracelet || bracelet.finishedAt) return
  update('collection', (c) => {
    const beads = { ...c.beads }
    for (const b of bracelet.beads) if (b) beads[b] = (beads[b] ?? 0) + 1
    return { ...c, beads, bracelets: c.bracelets.filter((b) => b.id !== id) }
  })
}

/** The bracelet she is working on (newest unfinished), if any. */
export function currentBracelet(collection: CollectionSection = getDoc().collection): Bracelet | undefined {
  return [...collection.bracelets].reverse().find((b) => !b.finishedAt)
}

/** Her most recently finished bracelet, if any. */
export function latestFinishedBracelet(collection: CollectionSection = getDoc().collection): Bracelet | undefined {
  return [...collection.bracelets].filter((b) => b.finishedAt).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0]
}
