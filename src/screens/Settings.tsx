import { useRef, useState } from 'react'
import {
  useProgress,
  update,
  exportJson,
  importJson,
  resetAll,
  type Prize,
} from '../store/progress'
import { clearToken, getToken, setToken, start as startSync, stop as stopSync, useSyncStatus } from '../store/gistSync'

const SESSION_OPTIONS = [5, 10, 15, 20]
const TIERS: Array<'gold' | 'silver' | 'bronze'> = ['gold', 'silver', 'bronze']
const TIER_LABEL: Record<(typeof TIERS)[number], string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not read that image'))
      img.onload = () => {
        const maxSize = 256
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas not supported'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export function PinGate({ pin, onUnlock }: { pin: string; onUnlock: () => void }) {
  const [entry, setEntry] = useState('')
  const [shake, setShake] = useState(false)

  function press(digit: string) {
    const next = (entry + digit).slice(0, 4)
    setEntry(next)
    if (next.length === 4) {
      if (next === pin) {
        onUnlock()
      } else {
        setShake(true)
        setTimeout(() => {
          setShake(false)
          setEntry('')
        }, 400)
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '2rem 1rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Coach&apos;s Settings</h1>
      <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>Enter the 4-digit PIN.</p>
      <div style={{ display: 'flex', gap: '0.6rem', animation: shake ? 'cc-shake 400ms' : undefined }}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: i < entry.length ? 'var(--cc-primary)' : 'var(--cc-border)',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', width: 240 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              className="cc-btn cc-btn-surface"
              style={{ fontSize: '1.2rem' }}
              onClick={() => (key === '⌫' ? setEntry((e) => e.slice(0, -1)) : press(key))}
            >
              {key}
            </button>
          ),
        )}
      </div>
    </div>
  )
}

/** Cash range inputs work in dollars, in 5-cent steps, clamped to the $0-$1 hard limit. */
const CASH_DOLLAR_STEP = 0.05
const CASH_DOLLAR_MAX = 1

function centsToDollarsInput(cents: number | undefined, fallback: number): string {
  return ((cents ?? fallback) / 100).toFixed(2)
}

function dollarsInputToCents(value: string): number {
  const dollars = Number(value)
  if (!Number.isFinite(dollars)) return 0
  const clamped = Math.max(0, Math.min(CASH_DOLLAR_MAX, dollars))
  return Math.round(clamped * 100)
}

function PrizePoolEditor({ tier }: { tier: (typeof TIERS)[number] }) {
  const progress = useProgress()
  const prizes = progress.settings.prizePools[tier]

  function setPrizes(next: Prize[]) {
    update('settings', (s) => ({ ...s, prizePools: { ...s.prizePools, [tier]: next } }))
  }

  function updatePrize(id: string, patch: Partial<Prize>) {
    setPrizes(prizes.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <strong>{TIER_LABEL[tier]} prizes</strong>
      {prizes.map((p) => {
        const isCash = p.kind === 'cash'
        const minCents = p.minCents ?? 5
        const maxCents = p.maxCents ?? 100
        return (
          <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input
                value={p.emoji}
                onChange={(e) => updatePrize(p.id, { emoji: e.target.value })}
                style={{ width: 44, textAlign: 'center' }}
                aria-label="Prize emoji"
              />
              {isCash ? (
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
                  Cash surprise
                </span>
              ) : (
                <input
                  value={p.name}
                  onChange={(e) => updatePrize(p.id, { name: e.target.value })}
                  style={{ flex: 1, minWidth: 0 }}
                  aria-label="Prize name"
                />
              )}
              <input
                type="number"
                min={0}
                value={p.weight}
                onChange={(e) => updatePrize(p.id, { weight: Number(e.target.value) })}
                style={{ width: 56 }}
                aria-label="Prize weight"
              />
              <button
                type="button"
                className="cc-btn cc-btn-surface"
                style={{ minHeight: 40, minWidth: 40, padding: '0.3rem' }}
                onClick={() => setPrizes(prizes.filter((x) => x.id !== p.id))}
                aria-label={`Delete ${p.name}`}
              >
                🗑️
              </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', minHeight: 32 }}>
              <input
                type="checkbox"
                checked={isCash}
                onChange={(e) =>
                  updatePrize(
                    p.id,
                    e.target.checked
                      ? { kind: 'cash', name: 'Cash surprise', minCents: p.minCents ?? 5, maxCents: p.maxCents ?? 100 }
                      : { kind: undefined, minCents: undefined, maxCents: undefined, name: p.name === 'Cash surprise' ? 'New prize' : p.name },
                  )
                }
              />
              Cash?
            </label>
            {isCash && (
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', paddingLeft: '0.2rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
                  Min
                  <input
                    type="number"
                    min={0}
                    max={CASH_DOLLAR_MAX}
                    step={CASH_DOLLAR_STEP}
                    value={centsToDollarsInput(p.minCents, 5)}
                    onChange={(e) => {
                      const nextMin = dollarsInputToCents(e.target.value)
                      updatePrize(p.id, { minCents: nextMin, maxCents: Math.max(nextMin, maxCents) })
                    }}
                    style={{ width: 68 }}
                    aria-label="Minimum cash amount in dollars"
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
                  Max
                  <input
                    type="number"
                    min={0}
                    max={CASH_DOLLAR_MAX}
                    step={CASH_DOLLAR_STEP}
                    value={centsToDollarsInput(p.maxCents, 100)}
                    onChange={(e) => {
                      const nextMax = dollarsInputToCents(e.target.value)
                      updatePrize(p.id, { maxCents: nextMax, minCents: Math.min(minCents, nextMax) })
                    }}
                    style={{ width: 68 }}
                    aria-label="Maximum cash amount in dollars"
                  />
                </label>
              </div>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="cc-btn cc-btn-surface"
        onClick={() => setPrizes([...prizes, { id: uid(), name: 'New prize', emoji: '🎁', weight: 1 }])}
      >
        + Add prize
      </button>
    </div>
  )
}

export function Settings() {
  const progress = useProgress()
  const syncStatus = useSyncStatus()
  const [unlocked, setUnlocked] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [newPin, setNewPin] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  if (!unlocked) {
    return <PinGate pin={progress.settings.pin} onUnlock={() => setUnlocked(true)} />
  }

  const settings = progress.settings

  function handleExport() {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cubeclimb-backup.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(file: File) {
    setImportError(null)
    try {
      const text = await file.text()
      importJson(text)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'That file did not look like a CubeClimb backup.')
    }
  }

  async function handleStickerFile(file: File) {
    try {
      const dataUrl = await downscaleImage(file)
      update('rewards', (r) => ({
        ...r,
        customStickers: [...r.customStickers, { id: uid(), name: file.name.replace(/\.[^.]+$/, ''), dataUrl }],
      }))
    } catch {
      // Silently ignore an unreadable file - the parent can just try another one.
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1rem 1rem 3rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Coach&apos;s Settings</h1>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Names</h2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontWeight: 700 }}>
          Kid&apos;s name
          <input
            value={settings.kidName}
            onChange={(e) => update('settings', (s) => ({ ...s, kidName: e.target.value }))}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontWeight: 700 }}>
          Parent&apos;s name
          <input
            value={settings.parentName}
            onChange={(e) => update('settings', (s) => ({ ...s, parentName: e.target.value }))}
          />
        </label>
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Session length</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {SESSION_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className="cc-btn"
              onClick={() => update('settings', (s) => ({ ...s, sessionMinutes: minutes }))}
              style={{
                flex: 1,
                background: settings.sessionMinutes === minutes ? 'var(--cc-primary)' : 'var(--cc-surface)',
                color: settings.sessionMinutes === minutes ? '#fff' : 'var(--cc-ink)',
                border: settings.sessionMinutes === minutes ? 'none' : '2px solid var(--cc-border)',
                boxShadow: 'none',
              }}
            >
              {minutes} min
            </button>
          ))}
        </div>
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Prize pools & ticket chance</h2>
        {TIERS.map((tier) => (
          <div key={tier} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <PrizePoolEditor tier={tier} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
              Ticket chance: {Math.round(settings.ticketChance[tier] * 100)}%
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.ticketChance[tier]}
                onChange={(e) =>
                  update('settings', (s) => ({
                    ...s,
                    ticketChance: { ...s.ticketChance, [tier]: Number(e.target.value) },
                  }))
                }
                style={{ flex: 1 }}
              />
            </label>
          </div>
        ))}
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Stickers</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleStickerFile(file)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          {progress.rewards.customStickers.map((cs) => (
            <div key={cs.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
              <img src={cs.dataUrl} alt={cs.name} style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 8 }} />
              <button
                type="button"
                className="cc-btn cc-btn-surface"
                style={{ minHeight: 32, padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                onClick={() =>
                  update('rewards', (r) => ({ ...r, customStickers: r.customStickers.filter((x) => x.id !== cs.id) }))
                }
              >
                Delete
              </button>
            </div>
          ))}
          {progress.rewards.customStickers.length === 0 && (
            <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>No custom stickers yet.</p>
          )}
        </div>
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Tickets to redeem</h2>
        {progress.rewards.tickets.filter((t) => !t.redeemedAt).length === 0 && (
          <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>Nothing waiting to be redeemed.</p>
        )}
        {progress.rewards.tickets
          .filter((t) => !t.redeemedAt)
          .map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ flex: 1 }}>
                🎟️ {t.emoji} {t.name}
              </span>
              <button
                type="button"
                className="cc-btn cc-btn-primary"
                style={{ minHeight: 36, padding: '0.3rem 0.75rem' }}
                onClick={() =>
                  update('rewards', (r) => ({
                    ...r,
                    tickets: r.tickets.map((x) => (x.id === t.id ? { ...x, redeemedAt: Date.now() } : x)),
                  }))
                }
              >
                Mark redeemed
              </button>
            </div>
          ))}
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>PIN</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="New 4-digit PIN"
            inputMode="numeric"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="cc-btn cc-btn-primary"
            disabled={newPin.length !== 4}
            onClick={() => {
              update('settings', (s) => ({ ...s, pin: newPin }))
              setNewPin('')
            }}
          >
            Save PIN
          </button>
        </div>
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Secret word</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
          Everyone must type the secret word once per device. Default: <strong>climb</strong>. To change it, run{' '}
          <code>node scripts/hash-password.mjs &lt;new word&gt;</code> and paste the result into{' '}
          <code>src/content/access.ts</code>, then push.
        </p>
        <button
          type="button"
          className="cc-btn cc-btn-surface"
          onClick={() => {
            try {
              localStorage.removeItem('cubeclimb.unlocked')
            } catch {
              // Nothing to clean up if storage is unavailable.
            }
            window.location.reload()
          }}
        >
          Lock this device now
        </button>
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>GitHub sync</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>Status: {syncStatus}</p>
        {getToken() ? (
          <button
            type="button"
            className="cc-btn cc-btn-surface"
            onClick={() => {
              clearToken()
              stopSync()
            }}
          >
            Disconnect
          </button>
        ) : (
          <>
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>How do I get a token?</summary>
              <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
                <li>Go to github.com and sign in</li>
                <li>Settings → Developer settings → Fine-grained tokens</li>
                <li>Generate new token, expiry 1 year</li>
                <li>Under Account permissions, set Gists to "Read and write"</li>
                <li>Generate, copy the token, and paste it below</li>
              </ol>
            </details>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste GitHub token"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                className="cc-btn cc-btn-primary"
                disabled={tokenInput.trim() === ''}
                onClick={() => {
                  setToken(tokenInput.trim())
                  setTokenInput('')
                  startSync()
                }}
              >
                Connect
              </button>
            </div>
          </>
        )}
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Backup</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="cc-btn cc-btn-surface" onClick={handleExport}>
            Export backup
          </button>
          <button type="button" className="cc-btn cc-btn-surface" onClick={() => importInputRef.current?.click()}>
            Import backup
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImportFile(file)
              if (importInputRef.current) importInputRef.current.value = ''
            }}
          />
        </div>
        {importError && <p style={{ margin: 0, color: 'var(--cc-danger)' }}>{importError}</p>}
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '2px solid var(--cc-danger)' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--cc-danger)' }}>Danger zone</h2>
        {!confirmingReset ? (
          <button
            type="button"
            className="cc-btn"
            style={{ background: 'var(--cc-danger)', color: '#fff' }}
            onClick={() => setConfirmingReset(true)}
          >
            Reset all progress
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontWeight: 700 }}>
              This erases all progress, tokens, stickers, and solves for everyone. Are you sure?
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="cc-btn"
                style={{ background: 'var(--cc-danger)', color: '#fff' }}
                onClick={() => {
                  resetAll()
                  setConfirmingReset(false)
                }}
              >
                Yes, reset everything
              </button>
              <button type="button" className="cc-btn cc-btn-surface" onClick={() => setConfirmingReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
