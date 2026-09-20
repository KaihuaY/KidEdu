// Measures a finished piano take: how long she actually played, tempo and
// whether it drifted, how steady the beat was, hesitations, loud/soft range,
// and (for a named piece) how the take lines up against that piece's
// reference take. Everything here is pure and synchronous over decoded PCM,
// so it runs identically on the iPad, in unit tests (synthetic signals) and
// in the Drive backfill (scripts/backfill-analysis.mjs drives this same
// module inside headless Chrome). Only `decodeToMono` touches the browser.
//
// These are *measurements of sound through a tablet microphone*, not a
// judgement of right or wrong notes - nothing in here knows the score. The
// coach wording (src/content/coachPrompt.ts) is built around that limit.

import type { TakeMetrics } from '../store/progress'
import { steadinessScore } from './steadiness'

// --- Tunables ---------------------------------------------------------------

const TARGET_RATE = 11025 // plenty for piano fundamentals + a few harmonics
const FRAME = 1024 // ~93 ms at TARGET_RATE
const HOP = 256 // ~23 ms
const MIN_ONSET_GAP_S = 0.1
const PLAY_HANG_S = 0.4 // a note's decay still counts as "playing"
const MIN_PAUSE_S = 1.5
const FP_BLOCK_S = 0.5 // chroma fingerprint resolution (2 Hz)
const CHROMA_MIN_HZ = 55
const CHROMA_MAX_HZ = 2000

/** A take's pitch-class fingerprint: 12 values per 0.5 s block, L2-normalised; silent blocks are dropped. */
export interface Fingerprint {
  /** Seconds per block. */
  blockSec: number
  /** Flattened [block][12]. */
  data: Float32Array
  blocks: number
}

export interface TakeAnalysis {
  metrics: TakeMetrics
  fingerprint: Fingerprint
  /** Onset times in ms (offline detector), for steadiness and debugging. */
  onsetsMs: number[]
}

// --- Small numeric helpers --------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))
  return sorted[idx]
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function round(value: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/** Box-filter decimation to roughly TARGET_RATE. Returns the new samples and rate. */
export function downsample(pcm: Float32Array, sampleRate: number): { samples: Float32Array; rate: number } {
  const factor = Math.max(1, Math.floor(sampleRate / TARGET_RATE))
  if (factor === 1) return { samples: pcm, rate: sampleRate }
  const n = Math.floor(pcm.length / factor)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    const base = i * factor
    for (let k = 0; k < factor; k++) sum += pcm[base + k]
    out[i] = sum / factor
  }
  return { samples: out, rate: sampleRate / factor }
}

/** In-place radix-2 FFT (length must be a power of two). */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k
        const b = a + (len >> 1)
        const xr = re[b] * cr - im[b] * ci
        const xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr
        im[b] = im[a] - xi
        re[a] += xr
        im[a] += xi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

// --- Frame features ---------------------------------------------------------

interface Frames {
  count: number
  hopSec: number
  db: Float32Array // loudness per frame, dBFS
  flux: Float32Array // spectral flux (onset strength)
  chroma: Float32Array // [frame][12], raw energy
}

function frameFeatures(samples: Float32Array, rate: number): Frames {
  const count = samples.length < FRAME ? 0 : 1 + Math.floor((samples.length - FRAME) / HOP)
  const db = new Float32Array(count)
  const flux = new Float32Array(count)
  const chroma = new Float32Array(count * 12)
  const window = new Float32Array(FRAME)
  for (let i = 0; i < FRAME; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1))

  // Which pitch class each FFT bin feeds (or -1 outside the piano-useful band).
  const half = FRAME >> 1
  const binClass = new Int8Array(half)
  for (let b = 0; b < half; b++) {
    const hz = (b * rate) / FRAME
    if (hz < CHROMA_MIN_HZ || hz > CHROMA_MAX_HZ) {
      binClass[b] = -1
    } else {
      const midi = 69 + 12 * Math.log2(hz / 440)
      binClass[b] = ((Math.round(midi) % 12) + 12) % 12
    }
  }

  const re = new Float32Array(FRAME)
  const im = new Float32Array(FRAME)
  let prev = new Float32Array(half)
  let cur = new Float32Array(half)
  for (let f = 0; f < count; f++) {
    const base = f * HOP
    let sumSq = 0
    for (let i = 0; i < FRAME; i++) {
      const v = samples[base + i]
      sumSq += v * v
      re[i] = v * window[i]
      im[i] = 0
    }
    db[f] = 10 * Math.log10(sumSq / FRAME + 1e-12)
    fft(re, im)
    let fl = 0
    for (let b = 1; b < half; b++) {
      const mag = Math.log1p(1000 * Math.hypot(re[b], im[b]))
      cur[b] = mag
      const d = mag - prev[b]
      if (d > 0) fl += d
      const pc = binClass[b]
      if (pc >= 0) chroma[f * 12 + pc] += mag * mag
    }
    flux[f] = f === 0 ? 0 : fl
    const swap = prev
    prev = cur
    cur = swap
  }
  return { count, hopSec: HOP / rate, db, flux, chroma }
}

/** Frames where the piano is sounding: clearly above the room's noise floor. */
function soundingMask(frames: Frames): Uint8Array {
  const mask = new Uint8Array(frames.count)
  if (frames.count === 0) return mask
  const sorted = Array.from(frames.db).sort((a, b) => a - b)
  const floor = percentile(sorted, 0.1)
  const peak = percentile(sorted, 0.98)
  if (peak - floor < 8 || peak < -60) return mask // nothing but room noise
  const threshold = Math.max(floor + 10, peak - 38)
  for (let f = 0; f < frames.count; f++) if (frames.db[f] > threshold) mask[f] = 1
  return mask
}

/** Extends `mask` so a gap shorter than the piano's decay does not count as silence. */
function playingMask(mask: Uint8Array, hopSec: number): Uint8Array {
  const hang = Math.max(1, Math.round(PLAY_HANG_S / hopSec))
  const out = new Uint8Array(mask.length)
  let last = -Infinity
  for (let f = 0; f < mask.length; f++) {
    if (mask[f]) last = f
    if (f - last <= hang) out[f] = 1
  }
  let next = Infinity
  for (let f = mask.length - 1; f >= 0; f--) {
    if (mask[f]) next = f
    if (next - f <= hang) out[f] = 1
  }
  return out
}

function detectOnsets(frames: Frames, sounding: Uint8Array): number[] {
  const { flux, count, hopSec } = frames
  const active: number[] = []
  for (let f = 0; f < count; f++) if (sounding[f]) active.push(flux[f])
  const med = median(active)
  if (med <= 0) return []
  const minGap = Math.max(1, Math.round(MIN_ONSET_GAP_S / hopSec))
  const onsets: number[] = []
  let lastOnset = -Infinity
  const W = 12
  for (let f = 2; f < count - 2; f++) {
    if (!sounding[f] && !sounding[f + 1]) continue
    const v = flux[f]
    if (v <= flux[f - 1] || v < flux[f + 1] || v <= flux[f - 2] || v < flux[f + 2]) continue
    let sum = 0
    let n = 0
    for (let k = Math.max(0, f - W); k <= Math.min(count - 1, f + W); k++) {
      sum += flux[k]
      n++
    }
    if (v < (sum / n) * 1.6 + med * 0.5) continue
    if (f - lastOnset < minGap) continue
    onsets.push(f * hopSec * 1000)
    lastOnset = f
  }
  return onsets
}

/** Tempo from the autocorrelation of the onset-strength curve, with a gentle preference for 70-140 bpm. */
function estimateTempo(frames: Frames, onsetCount: number): number | undefined {
  if (onsetCount < 8) return undefined
  const { flux, count, hopSec } = frames
  const mean = flux.reduce((a, b) => a + b, 0) / Math.max(1, count)
  const x = new Float32Array(count)
  for (let i = 0; i < count; i++) x[i] = Math.max(0, flux[i] - mean)
  const minLag = Math.max(1, Math.round(60 / 200 / hopSec))
  const maxLag = Math.min(count - 1, Math.round(60 / 40 / hopSec))
  let best = 0
  let bestLag = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0
    for (let i = 0; i + lag < count; i++) acc += x[i] * x[i + lag]
    const bpm = 60 / (lag * hopSec)
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 100) / 0.9) ** 2)
    const score = (acc / (count - lag)) * prior
    if (score > best) {
      best = score
      bestLag = lag
    }
  }
  if (bestLag === 0) return undefined
  return Math.round(60 / (bestLag * hopSec))
}

function usableIntervals(onsetsMs: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < onsetsMs.length; i++) {
    const gap = onsetsMs[i] - onsetsMs[i - 1]
    if (gap >= 120 && gap <= 2000) out.push(gap)
  }
  return out
}

/** +0.10 = the last third was 10 % faster than the first third; undefined without enough evidence. */
function tempoDrift(onsetsMs: number[]): number | undefined {
  if (onsetsMs.length < 24) return undefined
  const third = Math.floor(onsetsMs.length / 3)
  const first = usableIntervals(onsetsMs.slice(0, third))
  const last = usableIntervals(onsetsMs.slice(onsetsMs.length - third))
  if (first.length < 6 || last.length < 6) return undefined
  const a = median(first)
  const b = median(last)
  if (a <= 0 || b <= 0) return undefined
  return round(a / b - 1, 2)
}

function buildFingerprint(frames: Frames, sounding: Uint8Array): Fingerprint {
  const perBlock = Math.max(1, Math.round(FP_BLOCK_S / frames.hopSec))
  const total = Math.floor(frames.count / perBlock)
  const rows: number[] = []
  for (let b = 0; b < total; b++) {
    const acc = new Float64Array(12)
    let live = 0
    for (let f = b * perBlock; f < (b + 1) * perBlock; f++) {
      if (!sounding[f]) continue
      live++
      for (let c = 0; c < 12; c++) acc[c] += frames.chroma[f * 12 + c]
    }
    if (live < perBlock * 0.25) continue // a silent block: pauses are measured elsewhere
    let norm = 0
    for (let c = 0; c < 12; c++) norm += acc[c] * acc[c]
    norm = Math.sqrt(norm)
    if (norm <= 0) continue
    for (let c = 0; c < 12; c++) rows.push(acc[c] / norm)
  }
  return { blockSec: FP_BLOCK_S, data: Float32Array.from(rows), blocks: rows.length / 12 }
}

// --- Public API -------------------------------------------------------------

/** Measures one take. `pcm` is a single channel at `sampleRate`. */
export function analyzeTake(pcm: Float32Array, sampleRate: number): TakeAnalysis {
  const { samples, rate } = downsample(pcm, sampleRate)
  const frames = frameFeatures(samples, rate)
  const sounding = soundingMask(frames)
  const playing = playingMask(sounding, frames.hopSec)
  const onsetsMs = detectOnsets(frames, sounding)

  let playedFrames = 0
  let first = -1
  let last = -1
  for (let f = 0; f < frames.count; f++) {
    if (!playing[f]) continue
    playedFrames++
    if (first < 0) first = f
    last = f
  }
  const playedSec = playedFrames * frames.hopSec

  // Hesitations: silent stretches *inside* the music that are long for this take's pace.
  const medIoiSec = median(usableIntervals(onsetsMs)) / 1000
  const pauseThreshold = Math.max(MIN_PAUSE_S, 3 * medIoiSec)
  let hesitations = 0
  let longestPauseSec = 0
  if (first >= 0) {
    let run = 0
    for (let f = first; f <= last; f++) {
      if (playing[f]) {
        if (run > 0) {
          const sec = run * frames.hopSec + PLAY_HANG_S * 2 // the hangover hid this much real silence
          if (sec >= pauseThreshold) hesitations++
          if (sec > longestPauseSec) longestPauseSec = sec
        }
        run = 0
      } else {
        run++
      }
    }
  }

  const loud: number[] = []
  for (let f = 0; f < frames.count; f++) if (sounding[f]) loud.push(frames.db[f])
  loud.sort((a, b) => a - b)
  const dynamicRangeDb = loud.length > 20 ? round(percentile(loud, 0.9) - percentile(loud, 0.1), 1) : 0

  const metrics: TakeMetrics = {
    v: 1,
    playedSec: Math.round(playedSec),
    hesitations,
    longestPauseSec: round(longestPauseSec, 1),
    dynamicRangeDb,
  }
  const tempo = estimateTempo(frames, onsetsMs.length)
  if (tempo !== undefined) metrics.tempoBpm = tempo
  const drift = tempoDrift(onsetsMs)
  if (drift !== undefined) metrics.tempoDrift = drift
  const steady = steadinessScore(onsetsMs)
  if (steady !== undefined) metrics.steadiness = round(steady, 2)
  if (playedSec >= 5 && onsetsMs.length >= 4) metrics.noteRate = round(onsetsMs.length / playedSec, 2)

  return { metrics, fingerprint: buildFingerprint(frames, sounding), onsetsMs }
}

export interface ReferenceComparison {
  /** 0-1: the share of the reference take this take travelled through. */
  coverage: number
  /** 0-1 similarity along the aligned path. */
  matchToBest: number
  /** Positions (0-1 through the reference) where she lingered or repeated for 2 s or more. */
  stumbles: number[]
}

function blockCost(a: Fingerprint, i: number, b: Fingerprint, j: number): number {
  let dot = 0
  const ao = i * 12
  const bo = j * 12
  for (let c = 0; c < 12; c++) dot += a.data[ao + c] * b.data[bo + c]
  return 1 - Math.max(0, Math.min(1, dot))
}

/**
 * Aligns `take` against `reference` with subsequence DTW (the take may start
 * and stop anywhere in the piece, e.g. practising only the second line), and
 * reports how much of the piece it covered, how closely it matched, and
 * where the alignment stalled. Undefined when either side is too short to say.
 */
export function compareToReference(take: Fingerprint, reference: Fingerprint): ReferenceComparison | undefined {
  const n = take.blocks
  const m = reference.blocks
  if (n < 6 || m < 6) return undefined

  const cost = new Float32Array(n * m)
  const from = new Uint8Array(n * m) // 0 = diagonal, 1 = up (take advances), 2 = left (reference advances)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const c = blockCost(take, i, reference, j)
      if (i === 0) {
        cost[j] = c // free start anywhere in the reference
        continue
      }
      const up = cost[(i - 1) * m + j]
      const diag = j > 0 ? cost[(i - 1) * m + j - 1] : Infinity
      const left = j > 0 ? cost[i * m + j - 1] : Infinity
      let best = diag
      let dir = 0
      if (up < best) {
        best = up
        dir = 1
      }
      if (left < best) {
        best = left
        dir = 2
      }
      cost[i * m + j] = c + best
      from[i * m + j] = dir
    }
  }

  // Free end: the cheapest place in the reference for the take to stop.
  let endJ = 0
  for (let j = 1; j < m; j++) if (cost[(n - 1) * m + j] < cost[(n - 1) * m + endJ]) endJ = j

  let i = n - 1
  let j = endJ
  let steps = 0
  let sum = 0
  const refAtTake = new Int32Array(n)
  while (i >= 0) {
    sum += blockCost(take, i, reference, j)
    steps++
    refAtTake[i] = j
    if (i === 0) break
    const dir = from[i * m + j]
    if (dir === 0) {
      i--
      j--
    } else if (dir === 1) {
      i--
    } else {
      j--
    }
  }
  const startJ = j

  const stumbles: number[] = []
  const stallBlocks = Math.round(2 / take.blockSec)
  let runStart = 0
  for (let k = 1; k <= n; k++) {
    if (k < n && refAtTake[k] - refAtTake[runStart] <= 1) continue
    if (k - runStart >= stallBlocks && stumbles.length < 5) stumbles.push(round(refAtTake[runStart] / m, 2))
    runStart = k
  }

  return {
    coverage: round(Math.min(1, (endJ - startJ + 1) / m), 2),
    matchToBest: round(Math.max(0, 1 - sum / Math.max(1, steps)), 2),
    stumbles,
  }
}

// --- Browser-only decode ----------------------------------------------------

type AudioContextCtor = new () => AudioContext

/** Decodes a recorded take to one channel of PCM. Resolves null when decoding is not possible. */
export async function decodeToMono(blob: Blob): Promise<{ pcm: Float32Array; sampleRate: number } | null> {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  if (!Ctor) return null
  let ctx: AudioContext | null = null
  try {
    ctx = new Ctor()
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer())
    return { pcm: buffer.getChannelData(0), sampleRate: buffer.sampleRate }
  } catch {
    return null
  } finally {
    if (ctx) {
      try {
        await ctx.close()
      } catch {
        // nothing useful to do
      }
    }
  }
}
