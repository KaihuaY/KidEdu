import { useMemo, useState } from 'react'
import { navigate } from '../../router'
import { useProgress, type PianoPiece } from '../../store/progress'
import { allSongStats, formatTotal, pieceStatus, recentSeries, sortSongs, type SongSort, type SongStats } from '../../store/songStats'
import { localDay } from '../../store/sessions'
import { kidKey } from '../../store/kid'
import { MiniBarChart } from '../../components/MiniBarChart'

const SORTS: { key: SongSort; label: string }[] = [
  { key: 'plays', label: 'Most played' },
  { key: 'time', label: 'Most time' },
  { key: 'recent', label: 'Recent' },
  { key: 'name', label: 'A-Z' },
]

function sortStorageKey(): string {
  return kidKey('cubeclimb.piano.songsSort')
}

function isSongSort(value: string | null): value is SongSort {
  return value === 'plays' || value === 'time' || value === 'recent' || value === 'name'
}

function readStoredSort(): SongSort {
  try {
    const raw = sessionStorage.getItem(sortStorageKey())
    return isSongSort(raw) ? raw : 'plays'
  } catch {
    return 'plays'
  }
}

function storeSort(sort: SongSort): void {
  try {
    sessionStorage.setItem(sortStorageKey(), sort)
  } catch {
    // ignore - just won't be remembered across a reload
  }
}

/** "2026-09-21" -> "Sep 21". */
function monthDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function SongRow({ piece, stats, today }: { piece: PianoPiece; stats: SongStats; today: string }) {
  const sparkPoints = useMemo(
    () => recentSeries(stats, today, 21).map((d) => ({ label: d.day, value: d.plays })),
    [stats, today],
  )

  return (
    <button
      type="button"
      data-testid={`song-row-${piece.id}`}
      className="cc-card"
      style={{
        padding: '0.85rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        textAlign: 'left',
        minHeight: 56,
        width: '100%',
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
      }}
      onClick={() => navigate(`/piano/song/${piece.id}`)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: 0 }}>
        <strong>
          {piece.emoji} {piece.name}
        </strong>
        <span style={{ fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
          {stats.takes === 0
            ? 'not played yet'
            : `${stats.plays} play${stats.plays === 1 ? '' : 's'} · ${formatTotal(stats.totalSec)} · last ${monthDayLabel(stats.lastDay ?? today)}`}
        </span>
      </div>
      {stats.takes > 0 && <MiniBarChart points={sparkPoints} title={`${piece.name} plays, last 21 days`} compact />}
    </button>
  )
}

export function Songs() {
  const progress = useProgress()
  const pieces = progress.settings.pianoPieces
  const [sort, setSort] = useState<SongSort>(() => readStoredSort())
  const [archivedOpen, setArchivedOpen] = useState(false)
  const today = localDay()

  const stats = useMemo(() => allSongStats(progress), [progress])

  const active = useMemo(() => pieces.filter((p) => pieceStatus(p) !== 'archived'), [pieces])
  const archived = useMemo(() => pieces.filter((p) => pieceStatus(p) === 'archived'), [pieces])
  const sortedActive = useMemo(() => sortSongs(active, stats, sort), [active, stats, sort])
  const sortedArchived = useMemo(() => sortSongs(archived, stats, sort), [archived, stats, sort])

  const totals = useMemo(() => {
    let plays = 0
    let sec = 0
    for (const s of stats.values()) {
      plays += s.plays
      sec += s.totalSec
    }
    return { plays, sec }
  }, [stats])

  function handleSort(key: SongSort) {
    setSort(key)
    storeSort(key)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', padding: '1rem 1rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>🎵 My songs</h1>
        <button type="button" className="cc-btn cc-btn-surface" style={{ minHeight: 56 }} onClick={() => navigate('/piano')}>
          ⬅ Back
        </button>
      </div>

      <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>
        All songs: {totals.plays} play{totals.plays === 1 ? '' : 's'} · {formatTotal(totals.sec)}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {SORTS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            data-testid={`songs-sort-${key}`}
            className={`cc-btn ${sort === key ? 'cc-btn-primary' : 'cc-btn-surface'}`}
            style={{ minHeight: 44, padding: '0.4rem 0.9rem' }}
            onClick={() => handleSort(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {sortedActive.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>No songs yet - ask a grown-up to add one in Settings.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {sortedActive.map((piece) => (
            <SongRow key={piece.id} piece={piece} stats={stats.get(piece.id)!} today={today} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <button
            type="button"
            data-testid="archived-fold"
            className="cc-btn cc-btn-surface"
            style={{ minHeight: 56, justifyContent: 'space-between', display: 'flex' }}
            onClick={() => setArchivedOpen((open) => !open)}
            aria-expanded={archivedOpen}
          >
            <span>Archived ({archived.length})</span>
            <span aria-hidden>{archivedOpen ? '▲' : '▼'}</span>
          </button>
          {archivedOpen &&
            sortedArchived.map((piece) => <SongRow key={piece.id} piece={piece} stats={stats.get(piece.id)!} today={today} />)}
        </div>
      )}
    </div>
  )
}
