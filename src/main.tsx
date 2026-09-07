import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { start as startGistSync } from './store/gistSync'

// No-op if the parent hasn't set a GitHub token yet (see Settings screen).
startGistSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
