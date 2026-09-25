import { describe, expect, it } from 'vitest'
import type { PianoPiece } from '../progress'
import { assignMissingOrders, canMovePiece, movePieceOrder, nextOrderFor } from '../pieceOrder'

function piece(id: string, patch: Partial<PianoPiece> = {}): PianoPiece {
  return { id, name: id, emoji: '🎵', ...patch }
}

describe('assignMissingOrders', () => {
  it('backfills order by position within each status group, leaving explicit orders untouched', () => {
    const pieces = [piece('a', { status: 'week' }), piece('b', { status: 'keep' }), piece('c', { status: 'week' }), piece('d', { status: 'week', order: 9 })]
    const out = assignMissingOrders(pieces)
    expect(out.find((p) => p.id === 'a')?.order).toBe(0)
    expect(out.find((p) => p.id === 'b')?.order).toBe(0)
    expect(out.find((p) => p.id === 'c')?.order).toBe(1)
    expect(out.find((p) => p.id === 'd')?.order).toBe(9) // untouched
  })

  it('treats pieces with no status as keep', () => {
    const pieces = [piece('a'), piece('b')]
    const out = assignMissingOrders(pieces)
    expect(out.map((p) => p.order)).toEqual([0, 1])
  })

  it('is pure - does not mutate the input', () => {
    const pieces = [piece('a', { status: 'week' })]
    assignMissingOrders(pieces)
    expect(pieces[0].order).toBeUndefined()
  })
})

describe('movePieceOrder', () => {
  it('swaps order with the previous sibling in the same status group when moving up', () => {
    const pieces = [piece('a', { status: 'week', order: 0 }), piece('b', { status: 'week', order: 1 }), piece('c', { status: 'week', order: 2 })]
    const out = movePieceOrder(pieces, 'b', 'up')
    expect(out.find((p) => p.id === 'a')?.order).toBe(1)
    expect(out.find((p) => p.id === 'b')?.order).toBe(0)
    expect(out.find((p) => p.id === 'c')?.order).toBe(2)
  })

  it('swaps order with the next sibling when moving down', () => {
    const pieces = [piece('a', { status: 'week', order: 0 }), piece('b', { status: 'week', order: 1 })]
    const out = movePieceOrder(pieces, 'a', 'down')
    expect(out.find((p) => p.id === 'a')?.order).toBe(1)
    expect(out.find((p) => p.id === 'b')?.order).toBe(0)
  })

  it('is a no-op at the top of the group', () => {
    const pieces = [piece('a', { status: 'week', order: 0 }), piece('b', { status: 'week', order: 1 })]
    const out = movePieceOrder(pieces, 'a', 'up')
    expect(out.find((p) => p.id === 'a')?.order).toBe(0)
    expect(out.find((p) => p.id === 'b')?.order).toBe(1)
  })

  it('is a no-op at the bottom of the group', () => {
    const pieces = [piece('a', { status: 'week', order: 0 }), piece('b', { status: 'week', order: 1 })]
    const out = movePieceOrder(pieces, 'b', 'down')
    expect(out.find((p) => p.id === 'b')?.order).toBe(1)
  })

  it('never swaps across status groups', () => {
    const pieces = [piece('a', { status: 'week', order: 5 }), piece('b', { status: 'keep', order: 0 })]
    // 'a' is the only piece in 'week', so moving it in either direction is a no-op
    // even though 'b' (a different group) has a lower order.
    const upResult = movePieceOrder(pieces, 'a', 'up')
    const downResult = movePieceOrder(pieces, 'a', 'down')
    expect(upResult.find((p) => p.id === 'a')?.order).toBe(5)
    expect(downResult.find((p) => p.id === 'a')?.order).toBe(5)
  })

  it('backfills missing orders before swapping', () => {
    const pieces = [piece('a', { status: 'week' }), piece('b', { status: 'week' })]
    const out = movePieceOrder(pieces, 'b', 'up')
    expect(out.find((p) => p.id === 'a')?.order).toBe(1)
    expect(out.find((p) => p.id === 'b')?.order).toBe(0)
  })

  it('returns the pieces unchanged (besides backfill) when the id is not found', () => {
    const pieces = [piece('a', { status: 'week', order: 0 })]
    const out = movePieceOrder(pieces, 'missing', 'up')
    expect(out).toHaveLength(1)
    expect(out[0].order).toBe(0)
  })
})

describe('canMovePiece', () => {
  const pieces = [piece('a', { status: 'week', order: 0 }), piece('b', { status: 'week', order: 1 }), piece('c', { status: 'keep', order: 0 })]

  it('disallows up at the top and down at the bottom of a group', () => {
    expect(canMovePiece(pieces, 'a', 'up')).toBe(false)
    expect(canMovePiece(pieces, 'b', 'down')).toBe(false)
  })

  it('allows the move otherwise', () => {
    expect(canMovePiece(pieces, 'a', 'down')).toBe(true)
    expect(canMovePiece(pieces, 'b', 'up')).toBe(true)
  })

  it('a lone piece in its group can move neither way', () => {
    expect(canMovePiece(pieces, 'c', 'up')).toBe(false)
    expect(canMovePiece(pieces, 'c', 'down')).toBe(false)
  })

  it('is false for an unknown id', () => {
    expect(canMovePiece(pieces, 'missing', 'up')).toBe(false)
  })
})

describe('nextOrderFor', () => {
  it('is 0 for an empty group', () => {
    expect(nextOrderFor([], 'week')).toBe(0)
  })

  it('is one past the current max order in that group', () => {
    const pieces = [piece('a', { status: 'week', order: 3 }), piece('b', { status: 'week', order: 7 }), piece('c', { status: 'keep', order: 20 })]
    expect(nextOrderFor(pieces, 'week')).toBe(8)
    expect(nextOrderFor(pieces, 'keep')).toBe(21)
    expect(nextOrderFor(pieces, 'archived')).toBe(0)
  })
})
