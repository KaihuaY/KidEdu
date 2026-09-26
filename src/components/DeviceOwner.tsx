import { KID_NAMES, getKid, setKid, type KidId } from '../store/kid'

/**
 * "This device belongs to" switch, mounted inside the PIN-protected part of
 * Settings. Switching kid reloads the page immediately, same as the Gate
 * does on a secret-word match - every store already booted with the old
 * kid's keys and only re-reads them from scratch after a reload.
 */
export function DeviceOwner() {
  const current = getKid()
  const kidIds = Object.keys(KID_NAMES) as KidId[]

  function choose(id: KidId) {
    if (id === current) return
    setKid(id)
    window.location.reload()
  }

  return (
    <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.05rem' }}>This device belongs to</h2>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {kidIds.map((id) => {
          const active = id === current
          return (
            <button
              key={id}
              type="button"
              className="cc-btn"
              onClick={() => choose(id)}
              aria-pressed={active}
              style={{
                flex: 1,
                minHeight: 56,
                fontSize: '1.05rem',
                background: active ? 'var(--cc-primary)' : 'var(--cc-surface)',
                color: active ? 'var(--cc-primary-ink)' : 'var(--cc-ink)',
                border: active ? 'none' : '2px solid var(--cc-border)',
                boxShadow: 'none',
              }}
            >
              {KID_NAMES[id]}
            </button>
          )
        })}
      </div>
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
        Each kid has her own progress, rewards and settings. Recordings stay on the device they were made on.
      </p>
    </section>
  )
}
