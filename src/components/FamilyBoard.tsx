import { navigate } from '../router'
import { useFamily, type FamilyMember } from '../store/family'
import { getToken } from '../store/gistSync'
import { KID_NAMES, DEFAULT_KID, kidDisplayName } from '../store/kid'
import type { KidId } from '../store/kid'
import { localDay } from '../store/sessions'

// ---------------------------------------------------------------------------
// The family board: a friendly side-by-side of both kids' week, shown as a
// compact card on Home and as its own full screen at #/family (Family.tsx).
// Renders nothing on a device with no gist token yet - there's nothing to
// compare without sync. Uses the same visual vocabulary as BadgeShelf.tsx /
// Home.tsx: .cc-card, --cc-* tokens, emoji-led rows.
// ---------------------------------------------------------------------------

interface Row {
  key: string
  emoji: string
  label: string
  /** A single number for leader comparison. */
  compare: (m: FamilyMember) => number
  /** What to print in the cell. */
  render: (m: FamilyMember) => string
}

const ROWS: Row[] = [
  {
    key: 'piano',
    emoji: '🎹',
    label: 'Piano minutes',
    compare: (m) => m.summary.pianoMinutesThisWeek,
    render: (m) => `${m.summary.pianoMinutesThisWeek} min`,
  },
  {
    key: 'missions',
    emoji: '🧗',
    label: 'Missions',
    compare: (m) => m.summary.missionsDone,
    render: (m) => `${m.summary.missionsDone}`,
  },
  {
    key: 'streaks',
    emoji: '🔥',
    label: 'Streaks',
    compare: (m) => m.summary.cubeStreak + m.summary.pianoStreak,
    render: (m) => `🧊${m.summary.cubeStreak} 🎹${m.summary.pianoStreak}`,
  },
  {
    key: 'badges',
    emoji: '🏅',
    label: 'Badges',
    compare: (m) => m.summary.badges,
    render: (m) => `${m.summary.badges}`,
  },
  {
    key: 'cards',
    emoji: '🃏',
    label: 'Cards',
    compare: (m) => m.summary.cardsOwned,
    render: (m) => `${m.summary.cardsOwned}`,
  },
]

/** Every kid id known to the app, Nora first. */
function orderedKidIds(): KidId[] {
  const ids = Object.keys(KID_NAMES) as KidId[]
  return ids.sort((a, b) => (a === DEFAULT_KID ? -1 : b === DEFAULT_KID ? 1 : 0))
}

/** "today" / "yesterday" / "3 days ago", or "not yet" for a kid with no activity at all. */
function daysAgoLabel(day: string | null): string {
  if (!day) return 'not yet'
  const today = localDay()
  if (day === today) return 'today'
  const [ty, tm, td] = today.split('-').map(Number)
  const [dy, dm, dd] = day.split('-').map(Number)
  const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(dy, dm - 1, dd)) / 86_400_000)
  if (diffDays === 1) return 'yesterday'
  if (diffDays <= 0) return 'today'
  return `${diffDays} days ago`
}

/** A short, always-kind line comparing the two kids on whichever metric first differs. Never "behind"/"loser" wording. */
function encouragingLine(self: FamilyMember, other: FamilyMember): string {
  const missionDiff = self.summary.missionsDone - other.summary.missionsDone
  if (missionDiff > 0) return "You're ahead on missions — keep climbing!"
  if (missionDiff < 0) {
    const n = Math.abs(missionDiff)
    return `${other.name} is ${n} mission${n === 1 ? '' : 's'} ahead — go climb!`
  }
  const pianoDiff = self.summary.pianoMinutesThisWeek - other.summary.pianoMinutesThisWeek
  if (pianoDiff > 0) return "You're ahead on piano minutes — keep it up!"
  if (pianoDiff < 0) return `${other.name} is ahead on piano minutes — go play!`
  return 'All even — a tie!'
}

export function FamilyBoard({ compact = false }: { compact?: boolean }) {
  const members = useFamily()
  if (!getToken()) return null

  const byId = new Map(members.map((m) => [m.id, m]))
  const kidIds = orderedKidIds()
  const columns = kidIds.map((id) => byId.get(id) ?? null)
  const present = columns.filter((c): c is FamilyMember => c !== null)
  const self = members.find((m) => m.self) ?? null
  const other = present.find((m) => !m.self) ?? null

  function leaderId(row: Row): KidId | null {
    if (present.length < 2) return null
    let bestId: KidId | null = null
    let bestValue = -Infinity
    let tie = false
    for (const m of present) {
      const value = row.compare(m)
      if (value > bestValue) {
        bestValue = value
        bestId = m.id
        tie = false
      } else if (value === bestValue) {
        tie = true
      }
    }
    return tie ? null : bestId
  }

  const totalPianoMinutes = present.reduce((sum, m) => sum + m.summary.pianoMinutesThisWeek, 0)
  const totalMissions = present.reduce((sum, m) => sum + m.summary.missionsDone, 0)

  const numberSize = compact ? '1rem' : '1.4rem'
  const headingSize = compact ? '1rem' : '1.2rem'

  const board = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.6rem' : '1rem' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `1.1fr repeat(${kidIds.length}, 1fr)`,
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <span />
        {kidIds.map((id) => (
          <strong key={id} style={{ fontSize: headingSize, textAlign: 'center' }}>
            {kidDisplayName(id)}
          </strong>
        ))}

        {ROWS.map((row) => (
          <FragmentRow key={row.key} row={row} kidIds={kidIds} byId={byId} leader={leaderId(row)} numberSize={numberSize} />
        ))}
      </div>

      {!compact && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {kidIds.map((id) => {
            const member = byId.get(id)
            return (
              <p key={id} style={{ margin: 0, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
                {member ? (
                  <>
                    Last practised ({kidDisplayName(id)}): {daysAgoLabel(member.summary.lastActiveDay)}
                  </>
                ) : (
                  `Waiting for ${kidDisplayName(id)}'s first practice ✨`
                )}
              </p>
            )
          })}
          {self && other && (
            <p style={{ margin: 0, fontWeight: 700 }}>{encouragingLine(self, other)}</p>
          )}
        </div>
      )}

      <p style={{ margin: 0, fontSize: compact ? '0.8rem' : '0.9rem', fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
        Team total: {totalPianoMinutes} min · {totalMissions} missions
      </p>
    </div>
  )

  if (!compact) {
    return board
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/family')}
      className="cc-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        padding: '1rem',
        width: '100%',
        minHeight: 56,
        textAlign: 'left',
        border: 'none',
        cursor: 'pointer',
        font: 'inherit',
        color: 'var(--cc-ink)',
      }}
    >
      <strong style={{ fontSize: '1.05rem' }}>👭 Nora &amp; Amelia this week</strong>
      {board}
    </button>
  )
}

/** One row of the grid: an emoji+label cell, then one cell per kid (a value, or a "waiting" placeholder). */
function FragmentRow({
  row,
  kidIds,
  byId,
  leader,
  numberSize,
}: {
  row: Row
  kidIds: KidId[]
  byId: Map<KidId, FamilyMember>
  leader: KidId | null
  numberSize: string
}) {
  return (
    <>
      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--cc-ink-soft)' }}>
        {row.emoji} {row.label}
      </span>
      {kidIds.map((id) => {
        const member = byId.get(id)
        return (
          <span
            key={id}
            data-testid={`family-${id}-${row.key}`}
            style={{ textAlign: 'center', fontWeight: 800, fontSize: numberSize, whiteSpace: 'nowrap' }}
          >
            {member ? (
              <>
                {row.render(member)}
                {leader === id && <span aria-hidden="true"> 🏅</span>}
              </>
            ) : (
              <span style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--cc-ink-soft)' }}>waiting…</span>
            )}
          </span>
        )
      })}
    </>
  )
}
