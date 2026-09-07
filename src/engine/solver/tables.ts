/**
 * Tiny lookup tables for the last-layer steps.
 *
 * The last layer is solved with a handful of tools only (a few top turns,
 * whole cube turns and one memorised trick).  That makes the reachable set of
 * positions small - a few hundred at most - so we can simply walk the whole
 * graph once and remember, for every position, which tool to reach for next.
 *
 * A "signature" squeezes the part of the cube a step cares about into a short
 * string; two cubes with the same signature always react the same way to the
 * moves of that step.
 *
 * Routes are measured in turns of the cube, not in tools used, so the table
 * never trades a memorised trick (seven or eight turns) for a couple of top
 * turns.  That keeps the number of times Nora repeats a trick at the minimum.
 */

import { applyAlg } from '../cube'

export interface TableSpec {
  /** the moves (single turns or whole algorithms) the step may use */
  moves: string[]
  /** the part of the cube this step looks at */
  sig: (state: string) => string
  /** when is this step finished? */
  done: (state: string) => boolean
  /** a cube where the step is already finished, used to walk the graph */
  seed: string
}

/** signature -> the move to play next ('' means: nothing left to do). */
export type SolutionTable = Map<string, string>

const turnsIn = (move: string): number => move.trim().split(/\s+/).length

export function buildTable(spec: TableSpec): SolutionTable {
  // 1. Walk every position reachable with these moves, keeping one example
  //    cube per signature plus the moves that lead into it.
  const example = new Map<string, string>()
  const incoming = new Map<string, Array<{ from: string; move: string }>>()
  const queue: string[] = [spec.seed]
  example.set(spec.sig(spec.seed), spec.seed)

  for (let head = 0; head < queue.length; head++) {
    const state = queue[head]
    const from = spec.sig(state)
    for (const move of spec.moves) {
      const nextState = applyAlg(state, move)
      const to = spec.sig(nextState)
      const list = incoming.get(to)
      if (list) list.push({ from, move })
      else incoming.set(to, [{ from, move }])
      if (!example.has(to)) {
        example.set(to, nextState)
        queue.push(nextState)
      }
    }
  }

  // 2. Walk backwards from every finished position (cheapest route first), so
  //    each signature learns the first move of a shortest route home.  All
  //    weights are small whole numbers, so a bucket queue is all we need.
  const next: SolutionTable = new Map()
  const cost = new Map<string, number>()
  const buckets: string[][] = []
  const addTo = (sig: string, distance: number) => {
    while (buckets.length <= distance) buckets.push([])
    buckets[distance].push(sig)
  }

  for (const entry of example) {
    if (spec.done(entry[1])) {
      cost.set(entry[0], 0)
      next.set(entry[0], '')
      addTo(entry[0], 0)
    }
  }

  for (let distance = 0; distance < buckets.length; distance++) {
    for (const sig of buckets[distance]) {
      if ((cost.get(sig) ?? -1) !== distance) continue // stale queue entry
      const list = incoming.get(sig)
      if (!list) continue
      for (const edge of list) {
        const candidate = distance + turnsIn(edge.move)
        const known = cost.get(edge.from)
        if (known !== undefined && known <= candidate) continue
        cost.set(edge.from, candidate)
        next.set(edge.from, edge.move)
        addTo(edge.from, candidate)
      }
    }
  }
  return next
}

/** Follow a table from `state` until the step is finished. */
export function solveWithTable(
  table: SolutionTable,
  sig: (state: string) => string,
  state: string,
  label: string,
): string[] {
  const moves: string[] = []
  let s = state
  for (let guard = 0; guard < 32; guard++) {
    const move = table.get(sig(s))
    if (move === undefined) throw new Error(`Cannot finish the ${label} step from this cube.`)
    if (move === '') return moves
    moves.push(move)
    s = applyAlg(s, move)
  }
  throw new Error(`The ${label} step is going round in circles.`)
}
