import { useEffect, useRef, useState } from 'react'
import {
  useProgress,
  update,
  exportJson,
  importJson,
  listBackups,
  restoreBackup,
  resetAll,
  setGoalMinutes,
  type PianoPiece,
  type Prize,
} from '../store/progress'
import { localDay } from '../store/sessions'
import { clearToken, getToken, setToken, start as startSync, stop as stopSync, useSyncStatus } from '../store/gistSync'
import { PinGate } from '../components/PinGate'
import { navigate } from '../router'
import { formatBytes, getRecordingStore } from '../store/recordings'
import {
  lastProgressBackupDay,
  retryFailedUploads,
  testDriveConnection,
  useUploadSummary,
  type DriveConfig,
} from '../store/driveUpload'
import { markAudioPruned } from '../store/piano'
import { addNote } from '../store/notes'
import { APP_BUILD } from '../buildInfo'

// Re-exported so BlindBox.tsx's `import { PinGate } from './Settings'` keeps working.
export { PinGate } from '../components/PinGate'

const CUBE_GOAL_OPTIONS = [5, 10, 15, 20]
const PIANO_GOAL_OPTIONS = [10, 15, 20, 30]
const RECORDING_KEEP_OPTIONS = [7, 14, 30]
const TIERS: Array<'gold' | 'silver' | 'bronze'> = ['gold', 'silver', 'bronze']
const TIER_LABEL: Record<(typeof TIERS)[number], string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const PIECE_GOAL_MAX_LENGTH = 80

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

function LeaveNoteSection({ kidName }: { kidName: string }) {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)

  function send() {
    const trimmed = text.trim()
    if (!trimmed) return
    addNote({ about: 'general', text: trimmed })
    setText('')
    setSent(true)
  }

  return (
    <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.05rem' }}>💌 Leave a note for {kidName}</h2>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value.slice(0, 140))
          setSent(false)
        }}
        maxLength={140}
        rows={2}
        placeholder={`Something nice for ${kidName}…`}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <button
        type="button"
        className="cc-btn cc-btn-primary"
        style={{ alignSelf: 'flex-start' }}
        disabled={!text.trim()}
        onClick={send}
      >
        Send 💌
      </button>
      {sent && <span style={{ color: 'var(--cc-success)', fontWeight: 700 }}>Sent 💛</span>}
    </section>
  )
}

function PianoPiecesEditor() {
  const progress = useProgress()
  const pieces = progress.settings.pianoPieces

  function setPieces(next: PianoPiece[]) {
    update('settings', (s) => ({ ...s, pianoPieces: next }))
  }

  function updatePiece(id: string, patch: Partial<PianoPiece>) {
    setPieces(pieces.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function updatePieceGoal(id: string, text: string) {
    const trimmed = text.slice(0, PIECE_GOAL_MAX_LENGTH)
    if (trimmed.trim() === '') {
      updatePiece(id, { goal: undefined, goalSetOn: undefined })
    } else {
      updatePiece(id, { goal: trimmed, goalSetOn: localDay() })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {pieces.map((p) => (
        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <input
              value={p.emoji}
              onChange={(e) => updatePiece(p.id, { emoji: e.target.value })}
              style={{ width: '3ch', textAlign: 'center' }}
              aria-label="Piece emoji"
            />
            <input
              value={p.name}
              onChange={(e) => updatePiece(p.id, { name: e.target.value })}
              placeholder="Piece name"
              style={{ flex: 1, minWidth: 0 }}
              aria-label="Piece name"
            />
            <button
              type="button"
              className="cc-btn cc-btn-surface"
              style={{ minHeight: 40, minWidth: 40, padding: '0.3rem' }}
              onClick={() => setPieces(pieces.filter((x) => x.id !== p.id))}
              aria-label={`Delete ${p.name || 'piece'}`}
            >
              🗑️
            </button>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.85rem', paddingLeft: '0.2rem' }}>
            🎯 This week&apos;s goal
            <input
              value={p.goal ?? ''}
              onChange={(e) => updatePieceGoal(p.id, e.target.value)}
              placeholder="Bars 1–8 three times without stopping"
              maxLength={PIECE_GOAL_MAX_LENGTH}
              aria-label={`This week's goal for ${p.name || 'piece'}`}
            />
          </label>
        </div>
      ))}
      {pieces.length === 0 && <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>No pieces added yet.</p>}
      <button
        type="button"
        className="cc-btn cc-btn-surface"
        onClick={() => setPieces([...pieces, { id: uid(), name: '', emoji: '🎵' }])}
      >
        ＋ Add piece
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
  const [recordingStats, setRecordingStats] = useState<{ count: number; bytes: number } | null>(null)
  const [confirmingDeleteRecordings, setConfirmingDeleteRecordings] = useState(false)
  const [driveTestMessage, setDriveTestMessage] = useState<string | null>(null)
  const [testingDrive, setTestingDrive] = useState(false)
  const [storageStatus, setStorageStatus] = useState<{ persisted: boolean; usage: number | null; quota: number | null } | null>(
    null,
  )
  const [backups, setBackups] = useState(() => listBackups())
  const [confirmingRestoreIndex, setConfirmingRestoreIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const uploadSummary = useUploadSummary()

  function refreshBackups() {
    setBackups(listBackups())
  }

  async function refreshStorageStatus() {
    try {
      const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
      if (!storage) return
      const persisted = typeof storage.persisted === 'function' ? await storage.persisted() : false
      let usage: number | null = null
      let quota: number | null = null
      if (typeof storage.estimate === 'function') {
        const est = await storage.estimate()
        usage = est.usage ?? null
        quota = est.quota ?? null
      }
      setStorageStatus({ persisted, usage, quota })
    } catch {
      // Leave storageStatus null - the "couldn't check" state below handles it.
    }
  }

  function refreshRecordingStats() {
    const store = getRecordingStore()
    Promise.all([store.list(), store.usageBytes()]).then(([items, bytes]) => {
      setRecordingStats({ count: items.length, bytes })
    })
  }

  useEffect(() => {
    refreshRecordingStats()
    void refreshStorageStatus()
    // Runs once on mount - the recordings store lives outside React state,
    // so this is the "load once, refresh after actions that change it"
    // pattern rather than something that reacts to a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!unlocked) {
    return <PinGate pin={progress.settings.pin} onUnlock={() => setUnlocked(true)} />
  }

  const settings = progress.settings
  const driveCfg: DriveConfig = settings.driveUpload ?? { scriptUrl: '', secret: '', folderName: 'Nora Piano' }

  function setDriveField(patch: Partial<DriveConfig>) {
    const next = { ...driveCfg, ...patch }
    update('settings', (s) => ({
      ...s,
      driveUpload: next.scriptUrl.trim() === '' && next.secret.trim() === '' ? undefined : next,
    }))
  }

  async function handleTestDrive() {
    setTestingDrive(true)
    setDriveTestMessage(null)
    const result = await testDriveConnection({
      scriptUrl: driveCfg.scriptUrl,
      secret: driveCfg.secret,
      folderName: driveCfg.folderName || 'Nora Piano',
    })
    setDriveTestMessage(result.message)
    setTestingDrive(false)
  }

  async function handleDeleteAllRecordings() {
    const store = getRecordingStore()
    const items = await store.list()
    await store.clear()
    markAudioPruned(items.map((item) => item.id))
    setConfirmingDeleteRecordings(false)
    refreshRecordingStats()
  }

  function handleExport() {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'practice-backup.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(file: File) {
    setImportError(null)
    try {
      const text = await file.text()
      importJson(text)
      refreshBackups() // importJson doesn't itself take an automatic backup, but restoreBackup below does - keep the list fresh either way
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'That file did not look like a practice backup.')
    }
  }

  function handleRestoreBackup(index: number) {
    restoreBackup(index)
    setConfirmingRestoreIndex(null)
    refreshBackups()
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
      <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Grown-up settings</h1>

      <button
        type="button"
        className="cc-btn cc-btn-surface"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate('/piano/review')}
      >
        👀 Grown-up review
      </button>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Names</h2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontWeight: 700 }}>
          Kid&apos;s name
          <input
            value={settings.kidName}
            onChange={(e) => update('settings', (s) => ({ ...s, kidName: e.target.value }))}
          />
        </label>
      </section>

      <LeaveNoteSection kidName={settings.kidName} />

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Daily goals</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontWeight: 700, color: 'var(--cc-ink-soft)' }}>🧊 Cube</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {CUBE_GOAL_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className="cc-btn"
                onClick={() => setGoalMinutes('cube', minutes)}
                style={{
                  flex: 1,
                  background: settings.goalMinutes.cube === minutes ? 'var(--cc-primary)' : 'var(--cc-surface)',
                  color: settings.goalMinutes.cube === minutes ? '#fff' : 'var(--cc-ink)',
                  border: settings.goalMinutes.cube === minutes ? 'none' : '2px solid var(--cc-border)',
                  boxShadow: 'none',
                }}
              >
                {minutes} min
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontWeight: 700, color: 'var(--cc-ink-soft)' }}>🎹 Piano</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {PIANO_GOAL_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className="cc-btn"
                onClick={() => setGoalMinutes('piano', minutes)}
                style={{
                  flex: 1,
                  background: settings.goalMinutes.piano === minutes ? 'var(--cc-primary)' : 'var(--cc-surface)',
                  color: settings.goalMinutes.piano === minutes ? '#fff' : 'var(--cc-ink)',
                  border: settings.goalMinutes.piano === minutes ? 'none' : '2px solid var(--cc-border)',
                  boxShadow: 'none',
                }}
              >
                {minutes} min
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontWeight: 700, color: 'var(--cc-ink-soft)' }}>Piano goal counts</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(
              [
                { mode: 'recording' as const, label: '🎙️ the whole recording' },
                { mode: 'heard' as const, label: '👂 only when playing is heard' },
              ]
            ).map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                className="cc-btn"
                style={{
                  flex: 1,
                  minHeight: 56,
                  background: (settings.pianoCountMode ?? 'recording') === mode ? 'var(--cc-primary)' : 'var(--cc-surface)',
                  color: (settings.pianoCountMode ?? 'recording') === mode ? '#fff' : 'var(--cc-ink)',
                  border: (settings.pianoCountMode ?? 'recording') === mode ? 'none' : '2px solid var(--cc-border)',
                  boxShadow: 'none',
                }}
                onClick={() => update('settings', (s) => ({ ...s, pianoCountMode: mode }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Cube learning</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 700, minHeight: 56 }}>
          <input
            type="checkbox"
            checked={settings.showMoveLetters ?? false}
            onChange={(e) => update('settings', (s) => ({ ...s, showMoveLetters: e.target.checked }))}
            style={{ width: 24, height: 24 }}
          />
          Show move letters (R, U, F…)
        </label>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
          Off by default - she learns the moves by their friendly names first.
        </p>
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>This week&apos;s piano pieces</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
          Nora picks one of these before she records.
        </p>
        <PianoPiecesEditor />
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Recordings</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontWeight: 700, color: 'var(--cc-ink-soft)' }}>Keep local audio for</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {RECORDING_KEEP_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                className="cc-btn"
                onClick={() => update('settings', (s) => ({ ...s, recordingKeepDays: days }))}
                style={{
                  flex: 1,
                  background: settings.recordingKeepDays === days ? 'var(--cc-primary)' : 'var(--cc-surface)',
                  color: settings.recordingKeepDays === days ? '#fff' : 'var(--cc-ink)',
                  border: settings.recordingKeepDays === days ? 'none' : '2px solid var(--cc-border)',
                  boxShadow: 'none',
                }}
              >
                {days} days
              </button>
            ))}
          </div>
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
          Recordings on this device: {recordingStats?.count ?? '…'} ·{' '}
          {recordingStats ? formatBytes(recordingStats.bytes) : '…'}
        </p>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
          {storageStatus === null
            ? 'Storage: checking…'
            : storageStatus.persisted
              ? 'Storage: protected ✅'
              : 'Storage: not protected — Add to Home Screen keeps recordings safe'}
          {storageStatus?.quota != null && storageStatus.usage != null && (
            <> · {formatBytes(storageStatus.usage)} of {formatBytes(storageStatus.quota)} used</>
          )}
        </p>
        {!confirmingDeleteRecordings ? (
          <button
            type="button"
            className="cc-btn cc-btn-surface"
            onClick={() => setConfirmingDeleteRecordings(true)}
          >
            🗑️ Delete all recordings on this device
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="cc-btn"
              style={{ background: 'var(--cc-danger)', color: '#fff' }}
              onClick={() => void handleDeleteAllRecordings()}
            >
              Really delete?
            </button>
            <button
              type="button"
              className="cc-btn cc-btn-surface"
              onClick={() => setConfirmingDeleteRecordings(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      <section className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Google Drive upload</h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
          ☁️ {uploadSummary.done} saved · {uploadSummary.pending} waiting · {uploadSummary.failed} failed
        </p>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
          Last progress backup to Drive: {lastProgressBackupDay() ?? 'never'}
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontWeight: 700 }}>
          Script URL
          <input
            value={driveCfg.scriptUrl}
            onChange={(e) => setDriveField({ scriptUrl: e.target.value })}
            placeholder="https://script.google.com/macros/s/.../exec"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontWeight: 700 }}>
          Secret
          <input
            type="password"
            value={driveCfg.secret}
            onChange={(e) => setDriveField({ secret: e.target.value })}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontWeight: 700 }}>
          Folder name
          <input
            value={driveCfg.folderName}
            onChange={(e) => setDriveField({ folderName: e.target.value })}
            placeholder="Nora Piano"
          />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="cc-btn cc-btn-surface"
            disabled={testingDrive}
            onClick={() => void handleTestDrive()}
          >
            {testingDrive ? 'Testing…' : 'Test'}
          </button>
          {uploadSummary.failed > 0 && (
            <button type="button" className="cc-btn cc-btn-surface" onClick={() => retryFailedUploads()}>
              Retry failed
            </button>
          )}
        </div>
        {driveTestMessage && <p style={{ margin: 0, fontSize: '0.85rem' }}>{driveTestMessage}</p>}
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>How to set this up</summary>
          <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
            <li>
              Open <code>script.google.com</code> and click "New project".
            </li>
            <li>
              Delete the sample code, paste in the whole <code>scripts/drive-uploader.gs</code> file from this
              repo, and change <code>SECRET</code> to a word of your own.
            </li>
            <li>
              Click Deploy → New deployment → type Web app. Set "Execute as" to Me and "Who has access" to
              Anyone, then Deploy and authorize when asked. Copy the Web app URL (it ends in <code>/exec</code>).
            </li>
            <li>Paste that URL and the same secret above, then press Test.</li>
          </ol>
        </details>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <strong>Automatic backups</strong>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
            The app quietly saves a copy here whenever it notices something changed under the hood - a safety net,
            not something you need to manage day to day.
          </p>
          {backups.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>No automatic backups yet.</p>
          ) : (
            backups.map((b, index) => (
              <div
                key={`${b.savedAt}-${index}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}
              >
                <span style={{ flex: 1, fontSize: '0.85rem' }}>
                  {new Date(b.savedAt).toLocaleString()} · build {b.buildId} · {formatBytes(b.bytes)}
                </span>
                {confirmingRestoreIndex === index ? (
                  <>
                    <button
                      type="button"
                      className="cc-btn"
                      style={{ minHeight: 36, padding: '0.3rem 0.75rem', background: 'var(--cc-danger)', color: '#fff' }}
                      onClick={() => handleRestoreBackup(index)}
                    >
                      Really restore?
                    </button>
                    <button
                      type="button"
                      className="cc-btn cc-btn-surface"
                      style={{ minHeight: 36, padding: '0.3rem 0.75rem' }}
                      onClick={() => setConfirmingRestoreIndex(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="cc-btn cc-btn-surface"
                    style={{ minHeight: 36, padding: '0.3rem 0.75rem' }}
                    onClick={() => setConfirmingRestoreIndex(index)}
                  >
                    Restore
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cc-ink-soft)' }}>Version: {APP_BUILD}</p>
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
