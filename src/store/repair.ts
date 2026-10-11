// Repairs for a progress document that lost data: rebuilds the recording list
// from the audio this device still holds. Written after a sync accident wiped
// Amelia's takes while her audio files stayed safe in IndexedDB.

import { backupBeforeRisk, getDoc, update, type PianoTake } from './progress'
import { getRecordingStore, type RecordingMeta } from './recordings'
import { localDay } from './sessions'
import { getDeviceId } from './driveUpload'
import { recomputePianoStreak } from './sickDays'
import { pianoMarks } from './piano'
import { practiceSecondsForDay } from './pianoRewards'

/** Seconds of audio in `blob`, measured by the browser; 0 when it cannot be measured (tests, odd codecs). */
export async function measureSeconds(blob: Blob): Promise<number> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return 0
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = document.createElement('audio')
    const done = (sec: number) => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(sec) && sec > 0 ? Math.round(sec) : 0)
    }
    const timer = setTimeout(() => done(0), 8000)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      if (audio.duration === Infinity) {
        // Some recorders write no duration header; seeking to the end makes the browser compute it.
        audio.currentTime = 1e9
        audio.ontimeupdate = () => {
          audio.ontimeupdate = null
          clearTimeout(timer)
          done(audio.duration)
        }
      } else {
        clearTimeout(timer)
        done(audio.duration)
      }
    }
    audio.onerror = () => {
      clearTimeout(timer)
      done(0)
    }
    audio.src = url
  })
}

/** A take rebuilt from a stored recording: the day comes from when it was saved, the length from the audio itself. */
export function takeFromRecording(meta: RecordingMeta, durationSec: number, deviceId: string): PianoTake {
  const sec = Math.max(1, Math.round(durationSec))
  return {
    id: meta.id,
    day: localDay(new Date(meta.savedAt)),
    pieceId: null,
    startedAt: meta.savedAt - sec * 1000,
    durationSec: sec,
    activeSec: sec,
    mimeType: meta.mimeType,
    sizeBytes: meta.sizeBytes,
    hasAudio: true,
    deviceId,
  }
}

export interface RebuildResult {
  added: number
  daysRestamped: number
  streak: { current: number; best: number }
}

/**
 * Adds a take for every recording on this device that the doc no longer
 * lists, then re-stamps the daily ring for days that reach the goal and
 * recomputes the piano streak. Never touches takes that still exist, never
 * grants tokens (those live in the profile, which this cannot rebuild).
 * Takes an automatic backup first.
 */
export async function rebuildTakesFromRecordings(measure: (blob: Blob) => Promise<number> = measureSeconds): Promise<RebuildResult> {
  const store = getRecordingStore()
  const metas = await store.list()
  const known = new Set(getDoc().piano.takes.map((t) => t.id))
  const missing = metas.filter((m) => !known.has(m.id))
  if (missing.length === 0) {
    const s = getDoc().piano.streak
    return { added: 0, daysRestamped: 0, streak: { current: s.current, best: s.best } }
  }
  backupBeforeRisk('before rebuild')
  const deviceId = getDeviceId()
  const rebuilt: PianoTake[] = []
  for (const meta of missing) {
    const blob = await store.get(meta.id)
    const sec = blob ? await measure(blob) : 0
    rebuilt.push(takeFromRecording(meta, sec || Math.max(10, Math.round(meta.sizeBytes / 16_000)), deviceId))
  }
  rebuilt.sort((a, b) => a.startedAt - b.startedAt)

  let daysRestamped = 0
  update('piano', (piano) => {
    const takes = [...piano.takes, ...rebuilt].sort((a, b) => a.startedAt - b.startedAt)
    const days = { ...piano.days }
    const goal = pianoMarks(getDoc().settings)[0]?.minutes ?? 10
    for (const day of new Set(rebuilt.map((t) => t.day))) {
      if (days[day]?.goalReachedAt) continue
      if (practiceSecondsForDay(takes, day) >= goal * 60) {
        days[day] = { ...days[day], goalReachedAt: Date.now() }
        daysRestamped++
      }
    }
    const next = { ...piano, takes, days }
    return { ...next, streak: recomputePianoStreak(next) }
  })
  const s = getDoc().piano.streak
  return { added: rebuilt.length, daysRestamped, streak: { current: s.current, best: s.best } }
}
