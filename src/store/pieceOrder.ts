// Pure helpers for reordering pieces within their status group ("This week" /
// "Keep" / "Archived") in the Settings piece editor's ▲ ▼ buttons. Kept
// separate from progress.ts so the swap logic is easy to unit test.

import type { PianoPiece } from './progress'

type PieceStatusGroup = 'week' | 'keep' | 'archived'

function statusOf(p: PianoPiece): PieceStatusGroup {
  return p.status ?? 'keep'
}

/**
 * Fills in `order` for any piece missing it, using its position among pieces
 * of the same status encountered so far (in `pieces`' own order). Pieces that
 * already carry an `order` are left untouched. Pure - returns a new array.
 */
export function assignMissingOrders(pieces: PianoPiece[]): PianoPiece[] {
  const nextIndex: Partial<Record<PieceStatusGroup, number>> = {}
  return pieces.map((p) => {
    if (p.order !== undefined) return p
    const status = statusOf(p)
    const idx = nextIndex[status] ?? 0
    nextIndex[status] = idx + 1
    return { ...p, order: idx }
  })
}

/** Pieces of one status group, sorted the same way groupPieces()/sortSongs() would order manual position: by order then name. */
function sortedGroup(pieces: PianoPiece[], status: PieceStatusGroup): PianoPiece[] {
  return pieces
    .filter((p) => statusOf(p) === status)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
}

/**
 * Moves piece `id` one step up or down within its own status group by
 * swapping its `order` with its neighbor's. A no-op (besides backfilling
 * missing orders) at the top/bottom of the group, or if `id` isn't found.
 */
export function movePieceOrder(pieces: PianoPiece[], id: string, direction: 'up' | 'down'): PianoPiece[] {
  const withOrders = assignMissingOrders(pieces)
  const target = withOrders.find((p) => p.id === id)
  if (!target) return withOrders

  const group = sortedGroup(withOrders, statusOf(target))
  const idx = group.findIndex((p) => p.id === id)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || swapIdx < 0 || swapIdx >= group.length) return withOrders

  const a = group[idx]
  const b = group[swapIdx]
  const aOrder = a.order ?? 0
  const bOrder = b.order ?? 0
  return withOrders.map((p) => {
    if (p.id === a.id) return { ...p, order: bOrder }
    if (p.id === b.id) return { ...p, order: aOrder }
    return p
  })
}

/** Whether piece `id` can move `direction` within its status group (for disabling the button) - assumes orders are already backfilled, e.g. via assignMissingOrders. */
export function canMovePiece(pieces: PianoPiece[], id: string, direction: 'up' | 'down'): boolean {
  const target = pieces.find((p) => p.id === id)
  if (!target) return false
  const group = sortedGroup(pieces, statusOf(target))
  const idx = group.findIndex((p) => p.id === id)
  return direction === 'up' ? idx > 0 : idx >= 0 && idx < group.length - 1
}

/** The next `order` value for a brand-new piece in status `status` (one past the current max in that group; 0 when the group is empty). */
export function nextOrderFor(pieces: PianoPiece[], status: PieceStatusGroup): number {
  const group = pieces.filter((p) => statusOf(p) === status)
  if (group.length === 0) return 0
  return Math.max(...group.map((p) => p.order ?? 0)) + 1
}
