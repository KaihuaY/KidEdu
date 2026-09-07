import { applyMove } from '../engine/cube'

/**
 * Common interface for anything that can report the cube's current facelet
 * state and notify listeners when a move happens - whether that's a virtual
 * on-screen cube, a manually-entered state, or (eventually) a real
 * Bluetooth-connected smart cube.
 */
export interface CubeInput {
  getState(): string
  /** Registers a listener; returns an unsubscribe function. */
  onMove(cb: (move: string, state: string) => void): () => void
  dispose(): void
}

/**
 * A purely in-memory cube: moves are applied with the engine's `applyMove`
 * and the resulting facelet string is broadcast to listeners. This is what
 * backs the on-screen MoveArrows + TwistyCube demo (no physical cube).
 */
export class VirtualCubeInput implements CubeInput {
  private state: string
  private listeners = new Set<(move: string, state: string) => void>()

  constructor(initialState: string) {
    this.state = initialState
  }

  getState(): string {
    return this.state
  }

  apply(move: string): string {
    this.state = applyMove(this.state, move)
    for (const listener of this.listeners) listener(move, this.state)
    return this.state
  }

  onMove(cb: (move: string, state: string) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  dispose(): void {
    this.listeners.clear()
  }
}

/**
 * A cube whose state comes entirely from manual entry (e.g. ColorNet) rather
 * than from applying moves one at a time. `setState` replaces the whole
 * facelet string and notifies listeners with move `'?'` (no single move
 * produced this transition).
 */
export class ManualEntryInput implements CubeInput {
  private state: string
  private listeners = new Set<(move: string, state: string) => void>()

  constructor(initialState: string) {
    this.state = initialState
  }

  getState(): string {
    return this.state
  }

  setState(facelets: string): void {
    this.state = facelets
    for (const listener of this.listeners) listener('?', this.state)
  }

  onMove(cb: (move: string, state: string) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  dispose(): void {
    this.listeners.clear()
  }
}

// Future implementation: BluetoothCubeInput, connecting to a GAN/GoCube/etc.
// smart cube over Web Bluetooth, translating its move stream into the same
// CubeInput interface so the rest of the app doesn't need to know the
// difference between a virtual cube and a real one.
