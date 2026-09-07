import { navigate, useRoute } from '../router'

const TABS = [
  { path: '/wall', label: 'Wall', emoji: '🧗' },
  { path: '/help', label: 'Help', emoji: '🧩' },
  { path: '/solves', label: 'Solves', emoji: '⏱️' },
]

/** Segmented Wall / Help / Solves strip shown at the top of every cube-area screen. */
export function CubeTabs() {
  const { path } = useRoute()
  return (
    <div style={{ display: 'flex', gap: '0.5rem', padding: '1rem 1rem 0' }}>
      {TABS.map((tab) => {
        const active = path === tab.path
        return (
          <button
            key={tab.path}
            type="button"
            className="cc-btn"
            onClick={() => navigate(tab.path)}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              minHeight: 56,
              padding: '0.6rem 0.5rem',
              background: active ? 'var(--cc-primary)' : 'var(--cc-surface)',
              color: active ? '#fff' : 'var(--cc-ink)',
              border: active ? 'none' : '2px solid var(--cc-border)',
              boxShadow: 'none',
            }}
          >
            <span aria-hidden="true">{tab.emoji}</span> {tab.label}
          </button>
        )
      })}
    </div>
  )
}
