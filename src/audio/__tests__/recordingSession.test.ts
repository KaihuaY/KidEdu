// Exercises the recordingSession singleton against FakeAudioBackend. This
// test environment is node (no window/document), so the visibilitychange /
// pagehide wiring and the real wake lock are never reached - those are
// guarded defensively in recordingSession.ts/wakeLock.ts and are not
// covered here; see the report for what's left to a manual/iPad check.
//
// The ActivityMeter's 1 s warm-up and 2 s hold are real elapsed-time based
// (driven by the fake backend's own setInterval), so these tests wait on
// real timers rather than fake ones - fake-indexeddb's internal scheduling
// does not play well with vi.useFakeTimers(). Waits are kept short (~1-2.5s)
// with a generous per-test timeout.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { FakeAudioBackend, type FakeScript } from '../fakeBackend'
import {
  dismiss,
  getSessionState,
  isRecordingActive,
  recoverUnfinishedTakes,
  setAudioBackend,
  startTake,
  stopTake,
} from '../recordingSession'
import { getDoc, resetAll } from '../../store/progress'
import { getRecordingStore } from '../../store/recordings'

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A brief quiet moment to calibrate the noise floor, then sustained loud
// "playing" comfortably past the 1 s warm-up.
const LOUD_SCRIPT: FakeScript = [
  { rms: 0.004, ms: 200 },
  { rms: 0.3, ms: 2200 },
]

const SILENT_SCRIPT: FakeScript = [{ rms: 0.004, ms: 3000 }]

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
  resetAll()
  // Clean up any session left over from a previous test (only done/error/
  // idle can be dismissed - see the tests below, each of which drains its
  // own session before finishing).
  dismiss()
})

describe('recordingSession', () => {
  it('goes idle -> starting -> recording when the backend starts successfully', async () => {
    setAudioBackend(new FakeAudioBackend(LOUD_SCRIPT, { tickMs: 100 }))
    expect(getSessionState().status).toBe('idle')

    await startTake('piece-1')

    const state = getSessionState()
    expect(state.status).toBe('recording')
    if (state.status === 'recording') {
      expect(state.pieceId).toBe('piece-1')
    }
    expect(isRecordingActive(getSessionState())).toBe(true)

    await stopTake('user') // drain so the module singleton is clean for the next test
  }, 8000)

  it('accumulates active seconds while loud sound is detected, then saves a take on stop', async () => {
    setAudioBackend(new FakeAudioBackend(LOUD_SCRIPT, { tickMs: 100 }))
    await startTake('piece-1')

    await wait(2400)

    const beforeCount = getDoc().piano.takes.length
    await stopTake('user')

    const state = getSessionState()
    expect(state.status).toBe('done')
    if (state.status === 'done') {
      expect(state.discarded).toBe(false)
      expect(state.take.pieceId).toBe('piece-1')
      expect(state.take.activeSec).toBeGreaterThan(0)
      expect(state.take.hasAudio).toBe(true)
    }
    expect(getDoc().piano.takes.length).toBe(beforeCount + 1)
  }, 8000)

  it('discards a very short, silent take without saving it', async () => {
    setAudioBackend(new FakeAudioBackend(SILENT_SCRIPT, { tickMs: 100 }))
    await startTake(null)

    await wait(1200)

    const beforeCount = getDoc().piano.takes.length
    await stopTake('user')

    const state = getSessionState()
    expect(state.status).toBe('done')
    if (state.status === 'done') {
      expect(state.discarded).toBe(true)
    }
    expect(getDoc().piano.takes.length).toBe(beforeCount)
  }, 8000)

  it('dismiss() returns to idle from a done state, and is a no-op mid-recording', async () => {
    setAudioBackend(new FakeAudioBackend(SILENT_SCRIPT, { tickMs: 100 }))
    await startTake(null)

    dismiss() // should not interrupt an active recording
    expect(getSessionState().status).toBe('recording')

    await wait(1200)
    await stopTake('user')
    expect(getSessionState().status).toBe('done')

    dismiss()
    expect(getSessionState().status).toBe('idle')
  }, 8000)

  it('ignores a second startTake call while one is already active', async () => {
    setAudioBackend(new FakeAudioBackend(LOUD_SCRIPT, { tickMs: 100 }))
    await startTake('piece-1')

    await startTake('piece-2') // should be a no-op

    const state = getSessionState()
    expect(state.status).toBe('recording')
    if (state.status === 'recording') {
      expect(state.pieceId).toBe('piece-1')
    }

    await stopTake('user')
  }, 8000)
})

describe('partial chunk persistence during recording', () => {
  it('writes chunks to the partials store while recording and clears them on a normal stop', async () => {
    setAudioBackend(new FakeAudioBackend(LOUD_SCRIPT, { tickMs: 100 }))
    await startTake('piece-1')

    await wait(450) // a few 100ms chunk ticks from the fake backend's onChunk

    const midFlightIds = await getRecordingStore().listPartialIds()
    expect(midFlightIds.length).toBe(1)

    await stopTake('user')

    expect(getSessionState().status).toBe('done')
    expect(await getRecordingStore().listPartialIds()).toEqual([])
  }, 8000)
})

describe('recoverUnfinishedTakes', () => {
  it('turns leftover partial chunks - as if the app died mid-recording - into a real take, exactly once', async () => {
    // Seeded directly at the store level (rather than via startTake, which
    // this recordingSession singleton would then also need cleaning up from
    // an abandoned "recording" state) - this is exactly the shape stopTake()
    // never got the chance to assemble and delete after a crash.
    const store = getRecordingStore()
    const enc = new TextEncoder()
    const takeId = 'crash-take-1'
    await store.putPartial({
      id: takeId,
      seq: 0,
      bytes: enc.encode('chunk-0').buffer as ArrayBuffer,
      mimeType: 'audio/webm',
      startedAt: Date.now() - 5000,
      pieceId: 'piece-9',
      deviceId: 'device-1',
    })
    await store.putPartial({
      id: takeId,
      seq: 1,
      bytes: enc.encode('chunk-1').buffer as ArrayBuffer,
      mimeType: 'audio/webm',
      startedAt: Date.now() - 5000,
      pieceId: 'piece-9',
      deviceId: 'device-1',
    })

    const beforeCount = getDoc().piano.takes.length
    const recovered = await recoverUnfinishedTakes()
    expect(recovered).toBe(1)

    const takes = getDoc().piano.takes
    expect(takes.length).toBe(beforeCount + 1)
    const recoveredTake = takes.find((t) => t.id === takeId)
    expect(recoveredTake).toBeDefined()
    expect(recoveredTake?.pieceId).toBe('piece-9')
    expect(recoveredTake?.hasAudio).toBe(true)
    expect(recoveredTake?.durationSec).toBe(2) // 2 chunks, ~1s each

    expect(await store.listPartialIds()).toEqual([])
    expect(await recoverUnfinishedTakes()).toBe(0) // nothing left to recover a second time
  })
})
