import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setToken, start as startGistSync } from './store/gistSync'

// One-tap household setup link: https://<app>/#/setup?token=<gist-only token>
// Stores the sync token (and unlocks the secret-word gate) on this device,
// then scrubs the token out of the URL so it never sits in history/bookmarks.
function applySetupLink(): void {
  try {
    const hash = window.location.hash
    if (!hash.startsWith('#/setup')) return
    const query = hash.split('?')[1] ?? ''
    const token = new URLSearchParams(query).get('token')
    if (token && token.trim()) {
      setToken(token.trim())
      localStorage.setItem('cubeclimb.unlocked', '1')
    }
    window.history.replaceState(null, '', window.location.pathname + '#/home')
  } catch {
    // ignore - the parent can still paste the token in Settings
  }
}

applySetupLink()
// No-op if the parent hasn't set a GitHub token yet (see Settings screen).
startGistSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
