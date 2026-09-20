import { describe, expect, it } from 'vitest'
import { analyzeTake, compareToReference } from '../takeAnalysis'

const RATE = 22050

/** MIDI note -> Hz. */
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

interface Note {
  at: number // seconds
  midi: number
  gain?: number
}

/** A piano-ish tone: fast attack, exponential decay, three harmonics. Plus a little room noise. */
function synth(notes: Note[], totalSec: number, noise = 0.0005): Float32Array {
  const out = new Float32Array(Math.round(totalSec * RATE))
  let seed = 12345
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    out[i] = (seed / 0x7fffffff - 0.5) * 2 * noise
  }
  for (const n of notes) {
    const f = hz(n.midi)
    const g = n.gain ?? 0.3
    const start = Math.round(n.at * RATE)
    const len = Math.round(1.2 * RATE)
    for (let i = 0; i < len && start + i < out.length; i++) {
      const t = i / RATE
      const env = Math.min(1, t / 0.005) * Math.exp(-t * 4)
      out[start + i] += g * env * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t))
    }
  }
  return out
}

const SCALE = [60, 62, 64, 65, 67, 69, 71, 72]
const TUNE_A = [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60, 67, 67, 65, 65, 64, 64, 62, 67, 67, 65, 65, 64, 64, 62]
const TUNE_B = [64, 62, 60, 62, 64, 64, 64, 62, 62, 62, 64, 67, 67, 64, 62, 60, 62, 64, 64, 64, 64, 62, 62, 64, 62, 60, 60, 60]

function melody(midis: number[], beatSec: number, startAt = 0.5): Note[] {
  return midis.map((midi, i) => ({ at: startAt + i * beatSec, midi }))
}

describe('analyzeTake on synthetic piano', () => {
  it('finds tempo, steadiness and playing time on a steady 100 bpm scale with no hesitations', () => {
    const notes = melody([...SCALE, ...SCALE.slice().reverse(), ...SCALE, ...SCALE.slice().reverse()], 0.6)
    const { metrics, onsetsMs } = analyzeTake(synth(notes, 21), RATE)
    expect(onsetsMs.length).toBeGreaterThanOrEqual(28)
    expect(onsetsMs.length).toBeLessThanOrEqual(36)
    expect(Math.abs((metrics.tempoBpm ?? 0) - 100)).toBeLessThanOrEqual(3)
    expect(metrics.steadiness ?? 0).toBeGreaterThan(0.9)
    expect(metrics.hesitations).toBe(0)
    expect(metrics.playedSec).toBeGreaterThanOrEqual(18)
    expect(metrics.playedSec).toBeLessThanOrEqual(21)
  })

  it('counts one hesitation and measures it when she stops for three seconds mid-piece', () => {
    const first = melody(SCALE, 0.6)
    const second = melody(SCALE, 0.6, 0.5 + 8 * 0.6 + 3.0)
    const { metrics } = analyzeTake(synth([...first, ...second], 15), RATE)
    expect(metrics.hesitations).toBe(1)
    expect(metrics.longestPauseSec).toBeGreaterThan(2)
    expect(metrics.longestPauseSec).toBeLessThan(4.2)
  })

  it('reports a wider loud/soft range for a crescendo than for flat playing', () => {
    const flat = melody([...SCALE, ...SCALE, ...SCALE], 0.5)
    const grow = flat.map((n, i) => ({ ...n, gain: 0.02 + (0.5 * i) / flat.length }))
    const a = analyzeTake(synth(flat, 14), RATE).metrics.dynamicRangeDb
    const b = analyzeTake(synth(grow, 14), RATE).metrics.dynamicRangeDb
    expect(b).toBeGreaterThan(a + 4)
  })

  it('notices speeding up', () => {
    const slow = melody([...SCALE, ...SCALE], 0.7)
    const fast = melody([...SCALE, ...SCALE], 0.5, 0.5 + 16 * 0.7)
    const { metrics } = analyzeTake(synth([...slow, ...fast], 22), RATE)
    expect(metrics.tempoDrift ?? 0).toBeGreaterThan(0.2)
  })

  it('reports nothing played for room noise only', () => {
    const { metrics, fingerprint } = analyzeTake(synth([], 6, 0.002), RATE)
    expect(metrics.playedSec).toBe(0)
    expect(metrics.hesitations).toBe(0)
    expect(metrics.tempoBpm).toBeUndefined()
    expect(fingerprint.blocks).toBe(0)
  })
})

describe('compareToReference', () => {
  const reference = analyzeTake(synth(melody(TUNE_A, 0.5), 16), RATE).fingerprint

  it('gives full coverage and a high match for the same tune at a different speed', () => {
    const take = analyzeTake(synth(melody(TUNE_A, 0.62), 19), RATE).fingerprint
    const cmp = compareToReference(take, reference)!
    expect(cmp.coverage).toBeGreaterThan(0.85)
    expect(cmp.matchToBest).toBeGreaterThan(0.8)
  })

  it('reports about half coverage when she only plays the first half', () => {
    const take = analyzeTake(synth(melody(TUNE_A.slice(0, 14), 0.5), 9), RATE).fingerprint
    const cmp = compareToReference(take, reference)!
    expect(cmp.coverage).toBeGreaterThan(0.35)
    expect(cmp.coverage).toBeLessThan(0.7)
    expect(cmp.matchToBest).toBeGreaterThan(0.8)
  })

  it('matches the same tune better than a different tune', () => {
    const same = compareToReference(analyzeTake(synth(melody(TUNE_A, 0.55), 17), RATE).fingerprint, reference)!
    const other = compareToReference(analyzeTake(synth(melody(TUNE_B, 0.55), 17), RATE).fingerprint, reference)!
    expect(same.matchToBest).toBeGreaterThan(other.matchToBest + 0.05)
  })

  it('flags the spot where she got stuck repeating one note', () => {
    const stuck = [...TUNE_A.slice(0, 12), 65, 65, 65, 65, 65, 65, 65, 65, ...TUNE_A.slice(12)]
    const take = analyzeTake(synth(melody(stuck, 0.5), 20), RATE).fingerprint
    const cmp = compareToReference(take, reference)!
    expect(cmp.stumbles.length).toBeGreaterThanOrEqual(1)
    expect(cmp.stumbles[0]).toBeGreaterThan(0.2)
    expect(cmp.stumbles[0]).toBeLessThan(0.7)
  })

  it('declines to compare fragments that are too short', () => {
    const tiny = analyzeTake(synth(melody([60, 62], 0.5), 2), RATE).fingerprint
    expect(compareToReference(tiny, reference)).toBeUndefined()
  })
})
