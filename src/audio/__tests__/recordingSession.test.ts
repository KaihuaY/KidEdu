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

// Alternating short loud/quiet segments, tuned to rack up several onsets
// (one per loud-segment start - see fakeBands in fakeBackend.ts) within a
// short test wait: the OnsetDetector's envelope needs several ticks of
// quiet to decay back down before the next loud segment can register as a
// fresh onset (its 0.92-per-tick decay is a function of tick *count*, not
// wall time - hence the small tickMs below packing in enough ticks per
// quiet segment without a long real-time wait).
const REPEAT_SCRIPT: FakeScript = Array.from({ length: 10 }, () => [
  { rms: 0.3, ms: 100 },
  { rms: 0.02, ms: 300 },
]).flat()

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

    await wait(3200) // past the 3s wall-time floor, not just the activity meter's warm-up

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

  it('records onset timestamps from the spectrum and a steadiness score on a fairly regular take', async () => {
    setAudioBackend(new FakeAudioBackend(REPEAT_SCRIPT, { tickMs: 20 }))
    await startTake('piece-1')

    await wait(4200)

    await stopTake('user')

    const state = getSessionState()
    expect(state.status).toBe('done')
    if (state.status === 'done') {
      expect(state.discarded).toBe(false)
      expect(state.take.onsets).toBeDefined()
      expect((state.take.onsets ?? []).length).toBeGreaterThanOrEqual(8)
      expect(state.take.steadiness).toBeGreaterThan(0)
    }
  }, 10000)

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

  it('discards a very short take even when loud playing was heard - only wall time under 3s counts now', async () => {
    setAudioBackend(new FakeAudioBackend(LOUD_SCRIPT, { tickMs: 100 }))
    await startTake(null)

    await wait(1200) // loud almost the whole time, but well under the 3s wall-time floor

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

describe('startTake opts - grown-up voice notes', () => {
  it('flags the saved take isNote and auto-stops at maxSeconds without needing an explicit stopTake', async () => {
    setAudioBackend(new FakeAudioBackend(LOUD_SCRIPT, { tickMs: 100 }))
    const beforeCount = getDoc().piano.takes.length

    // maxSeconds is past the 3s wall-time floor so the take isn't discarded
    // as too short.
    await startTake('note', { isNote: true, maxSeconds: 3 })
    expect(getSessionState().status).toBe('recording')

    await wait(3400) // past the 3s auto-stop

    const state = getSessionState()
    expect(state.status).toBe('done')
    if (state.status === 'done') {
      expect(state.discarded).toBe(false)
      expect(state.take.isNote).toBe(true)
      expect(state.take.pieceId).toBe('note')
    }
    expect(getDoc().piano.takes.length).toBe(beforeCount + 1)
    expect(getDoc().piano.takes.at(-1)?.isNote).toBe(true)
  }, 8000)

  it('never sets isNote on an ordinary take', async () => {
    setAudioBackend(new FakeAudioBackend(LOUD_SCRIPT, { tickMs: 100 }))
    await startTake('piece-1')
    await wait(1200)
    await stopTake('user')

    const state = getSessionState()
    expect(state.status).toBe('done')
    if (state.status === 'done') {
      expect(state.take.isNote).toBeUndefined()
    }
  }, 8000)

  it('an explicit stopTake before maxSeconds elapses cancels the pending auto-stop', async () => {
    setAudioBackend(new FakeAudioBackend(LOUD_SCRIPT, { tickMs: 100 }))
    await startTake('note', { isNote: true, maxSeconds: 5 })
    await wait(300)
    await stopTake('user')
    expect(getSessionState().status).toBe('done')

    // If the earlier maxSeconds timer had survived, it would fire ~5s after
    // the first startTake and call stopTake() again mid this next
    // recording - waiting past that point and checking we're still cleanly
    // recording (not bounced back to 'done') proves it was cancelled.
    await startTake('piece-2')
    await wait(5200)
    expect(getSessionState().status).toBe('recording')
    await stopTake('user')
  }, 10000)
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
