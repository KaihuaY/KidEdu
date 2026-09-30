import { Component, type ErrorInfo, type ReactNode } from 'react'
import { navigate } from '../router'

// A render-time throw anywhere below <App> used to unmount the whole tree:
// the page went blank and only a reload brought it back. This boundary keeps
// the header and tab bar alive, shows a friendly card instead, and writes the
// error to localStorage so a grown-up (or a later session of ours) can read
// what happened under Settings → Danger zone → "Last crash".

export const LAST_CRASH_KEY = 'cubeclimb.lastCrash'

export interface CrashRecord {
  message: string
  stack?: string
  componentStack?: string
  path: string
  at: number
}

export function readLastCrash(): CrashRecord | null {
  try {
    const raw = localStorage.getItem(LAST_CRASH_KEY)
    return raw ? (JSON.parse(raw) as CrashRecord) : null
  } catch {
    return null
  }
}

export function clearLastCrash(): void {
  try {
    localStorage.removeItem(LAST_CRASH_KEY)
  } catch {
    // ignore
  }
}

function recordCrash(error: unknown, info?: ErrorInfo): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    const record: CrashRecord = {
      message: err.message,
      stack: err.stack?.slice(0, 2000),
      componentStack: info?.componentStack?.slice(0, 2000) ?? undefined,
      path: window.location.hash,
      at: Date.now(),
    }
    localStorage.setItem(LAST_CRASH_KEY, JSON.stringify(record))
  } catch {
    // Storage disabled: nothing to do.
  }
}

interface Props {
  children: ReactNode
  /** When this changes (e.g. the route), a shown error is cleared and the children render again. */
  resetKey?: string
  /** 'screen' keeps the app shell and offers "Go home"; 'app' is the outermost fallback with just "Reload". */
  level?: 'screen' | 'app'
}

interface State {
  error: Error | null
  resetKey?: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: undefined }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // The route changed since the crash: try again with the new screen.
    if (state.error && state.resetKey !== undefined && state.resetKey !== props.resetKey) {
      return { error: null, resetKey: props.resetKey }
    }
    if (state.resetKey !== props.resetKey) return { resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    recordCrash(error, info)
  }

  private goHome = () => {
    this.setState({ error: null })
    navigate('/home')
  }

  private reload = () => {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const level = this.props.level ?? 'screen'
    return (
      <div
        data-testid="error-boundary"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 1.25rem', textAlign: 'center' }}
      >
        <div className="cc-card" style={{ padding: '1.5rem', width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: '0.85rem', alignItems: 'center' }}>
          <span style={{ fontSize: '3rem', lineHeight: 1 }} aria-hidden="true">
            🙈
          </span>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Oops, that page hiccupped</h2>
          <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>Nothing is lost. Your practice is saved.</p>
          {level === 'screen' && (
            <button type="button" className="cc-btn cc-btn-primary" style={{ minHeight: 56, width: '100%' }} onClick={this.goHome}>
              🏠 Go home
            </button>
          )}
          <button type="button" className="cc-btn cc-btn-surface" style={{ minHeight: 56, width: '100%' }} onClick={this.reload}>
            🔄 Reload
          </button>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cc-ink-soft)', wordBreak: 'break-word' }}>{error.message}</p>
        </div>
      </div>
    )
  }
}
