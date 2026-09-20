import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setToken, start as startGistSync } from './store/gistSync'
import { startUploadWorker } from './store/driveUpload'
import { recoverUnfinishedTakes } from './audio/recordingSession'
import { getKid, isKidId, setKid } from './store/kid'
import { backfillLocalFingerprints } from './store/coach'
import { getRecordingStore } from './store/recordings'

// One-tap household setup link: https://<app>/#/setup?token=<gist-only token>[&kid=amelia|nora]
// Stores the sync token (and unlocks the secret-word gate) on this device,
// then scrubs the token out of the URL so it never sits in history/bookmarks.
// `kid` is set BEFORE the device is marked unlocked, so a device that's
// never chosen a kid before boots straight into the right one; if the kid
// this device now belongs to differs from the one the stores already booted
// with, a reload makes every store re-read its per-kid keys.
/** True if the link changed this device's kid (a reload is already underway). */
function applySetupLink(): boolean {
  try {
    const hash = window.location.hash
    if (!hash.startsWith('#/setup')) return false
    const query = hash.split('?')[1] ?? ''
    const params = new URLSearchParams(query)
    const token = params.get('token')
    const kidParam = params.get('kid')
    const bootedKid = getKid()
    if (isKidId(kidParam)) setKid(kidParam)
    if (token && token.trim()) {
      setToken(token.trim())
      localStorage.setItem('cubeclimb.unlocked', '1')
    }
    window.history.replaceState(null, '', window.location.pathname + '#/home')
    if (isKidId(kidParam) && kidParam !== bootedKid) {
      window.location.reload()
      return true
    }
    return false
  } catch {
    // ignore - the parent can still paste the token in Settings
    return false
  }
}

// A reload is already on its way - every store in memory still thinks it's
// the old kid, so don't start syncing/uploading against the wrong keys.
if (!applySetupLink()) {
  // No-op if the parent hasn't set a GitHub token yet (see Settings screen).
  startGistSync()
  // Uploads finished piano takes to the parent's Google Drive when configured.
  startUploadWorker()
  // Turns any partial recording left over from a crash/reload mid-take (see
  // audio/recordingSession.ts) into a real, playable take before Piano home
  // ever renders.
  void recoverUnfinishedTakes()
  // A little later, quietly give recent takes of named pieces a fingerprint on this device so
  // the coach can compare the next take against them (see store/coach.ts).
  setTimeout(() => void backfillLocalFingerprints((id) => getRecordingStore().get(id)), 10_000)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
