import { useMemo, useState } from 'react'
import { useProgress, update, type Sticker, type Ticket } from '../store/progress'
import { COMMON_WEIGHT, STICKERS } from '../content/stickers'
import { formatCents, pickWeighted, rollCashCents, rollTicket, type Tier } from '../store/rewards'
import { fireConfetti } from '../components/Confetti'
import { BadgeShelf } from '../components/BadgeShelf'
import { BadgeToast } from '../components/BadgeToast'
import { PinGate } from './Settings'

const TIER_META: Record<Tier, { label: string; emoji: string; color: string }> = {
  gold: { label: 'Gold Box', emoji: '🟡', color: '#f5d91a' },
  silver: { label: 'Silver Box', emoji: '⚪', color: '#c7cad9' },
  bronze: { label: 'Bronze Box', emoji: '🟤', color: '#c98a4b' },
}

interface OpenResult {
  tier: Tier
  sticker: { id: string; kind: 'emoji' | 'image'; value: string; name: string }
  ticket?: Ticket
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function BlindBox() {
  const progress = useProgress()
  const profile = progress.profiles.kid
  const [tab, setTab] = useState<'stickers' | 'tickets'>('stickers')
  const [redeeming, setRedeeming] = useState<Ticket | null>(null)
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null)
  const [opening, setOpening] = useState<Tier | null>(null)
  const [result, setResult] = useState<OpenResult | null>(null)

  const stickerPool = useMemo(
    () => [
      ...STICKERS.map((s) => ({ id: s.id, kind: 'emoji' as const, value: s.emoji, name: s.name, weight: s.weight })),
      ...progress.rewards.customStickers.map((cs) => ({
        id: cs.id,
        kind: 'image' as const,
        value: cs.dataUrl,
        name: cs.name,
        weight: COMMON_WEIGHT,
      })),
    ],
    [progress.rewards.customStickers],
  )

  function openBox(tier: Tier) {
    if (profile.tokens[tier] <= 0 || opening) return
    setOpening(tier)

    update('profiles', (profiles) => {
      const p = profiles.kid
      return { ...profiles, kid: { ...p, tokens: { ...p.tokens, [tier]: p.tokens[tier] - 1 } } }
    })

    setTimeout(() => {
      const wonSticker = pickWeighted(stickerPool) ?? stickerPool[0]
      const getsTicket = rollTicket(progress.settings.ticketChance[tier])
      const prizePool = progress.settings.prizePools[tier]
      const prize = getsTicket ? pickWeighted(prizePool) : undefined

      const now = Date.now()
      const stickerEntry: Sticker = {
        id: wonSticker.id,
        kind: wonSticker.kind,
        value: wonSticker.value,
        rarity: STICKERS.find((s) => s.id === wonSticker.id)?.rarity ?? 'common',
        wonAt: now,
      }
      const cashCents = prize?.kind === 'cash' ? rollCashCents(prize) : undefined
      const ticketEntry: Ticket | undefined = prize
        ? {
            id: uid(),
            prizeId: prize.id,
            name: cashCents !== undefined ? formatCents(cashCents) : prize.name,
            emoji: prize.emoji,
            tier,
            wonAt: now,
            ...(cashCents !== undefined ? { amountCents: cashCents } : {}),
          }
        : undefined

      update('rewards', (rewards) => ({
        ...rewards,
        stickers: [...rewards.stickers, stickerEntry],
        tickets: ticketEntry ? [...rewards.tickets, ticketEntry] : rewards.tickets,
        boxHistory: [
          ...rewards.boxHistory,
          {
            tier,
            openedAt: now,
            result: ticketEntry ? `${wonSticker.name} + 🎟️ ${ticketEntry.name}` : wonSticker.name,
          },
        ],
      }))

      fireConfetti(tier === 'gold' ? 'big' : 'small')
      setResult({ tier, sticker: wonSticker, ticket: ticketEntry })
      setOpening(null)
    }, 1500)
  }

  const stickerGroups = useMemo(() => {
    const groups = new Map<string, Sticker[]>()
    for (const s of progress.rewards.stickers) {
      const list = groups.get(s.id) ?? []
      list.push(s)
      groups.set(s.id, list)
    }
    return [...groups.entries()]
  }, [progress.rewards.stickers])

  const tickets = [...progress.rewards.tickets].sort((a, b) => {
    if (Boolean(a.redeemedAt) !== Boolean(b.redeemedAt)) return a.redeemedAt ? 1 : -1
    return b.wonAt - a.wonAt
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 1rem 2rem' }}>
      <BadgeToast />
      <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Blind Box</h1>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {(['gold', 'silver', 'bronze'] as Tier[]).map((tier) => {
          const meta = TIER_META[tier]
          const count = profile.tokens[tier]
          return (
            <div
              key={tier}
              className="cc-card"
              style={{ flex: '1 1 140px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'center' }}
            >
              <span style={{ fontSize: '2.5rem' }} aria-hidden="true">
                {meta.emoji}
              </span>
              <strong>{meta.label}</strong>
              <span style={{ color: 'var(--cc-ink-soft)', fontWeight: 700 }}>You have: {count}</span>
              <button
                type="button"
                className="cc-btn cc-btn-primary"
                disabled={count <= 0 || opening !== null}
                onClick={() => openBox(tier)}
                style={{
                  width: '100%',
                  animation: opening === tier ? 'cc-shake 400ms infinite' : undefined,
                }}
              >
                {opening === tier ? 'Opening...' : 'Open'}
              </button>
            </div>
          )
        })}
      </div>

      {result && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,18,43,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            zIndex: 50,
          }}
        >
          <div className="cc-card" style={{ padding: '1.75rem', maxWidth: 360, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.3rem' }}>
              {TIER_META[result.tier].emoji} You got a sticker!
            </h2>
            {result.sticker.kind === 'emoji' ? (
              <span style={{ fontSize: '3rem' }}>{result.sticker.value}</span>
            ) : (
              <img src={result.sticker.value} alt={result.sticker.name} style={{ width: 96, height: 96, objectFit: 'contain', margin: '0 auto' }} />
            )}
            <p style={{ margin: 0, fontWeight: 700 }}>{result.sticker.name}</p>
            {result.ticket && (
              <p style={{ margin: 0 }}>
                🎟️ Plus a prize ticket: <strong>{result.ticket.emoji} {result.ticket.name}</strong>!
              </p>
            )}
            <button type="button" className="cc-btn cc-btn-primary" onClick={() => setResult(null)}>
              Yay!
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          className="cc-btn"
          onClick={() => setTab('stickers')}
          style={{
            flex: 1,
            background: tab === 'stickers' ? 'var(--cc-primary)' : 'var(--cc-surface)',
            color: tab === 'stickers' ? '#fff' : 'var(--cc-ink)',
            border: tab === 'stickers' ? 'none' : '2px solid var(--cc-border)',
            boxShadow: 'none',
          }}
        >
          Sticker Book
        </button>
        <button
          type="button"
          className="cc-btn"
          onClick={() => setTab('tickets')}
          style={{
            flex: 1,
            background: tab === 'tickets' ? 'var(--cc-primary)' : 'var(--cc-surface)',
            color: tab === 'tickets' ? '#fff' : 'var(--cc-ink)',
            border: tab === 'tickets' ? 'none' : '2px solid var(--cc-border)',
            boxShadow: 'none',
          }}
        >
          Tickets ({tickets.filter((t) => !t.redeemedAt).length})
        </button>
      </div>

      {tab === 'stickers' && (
        <div
          className="cc-card"
          style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: '0.75rem' }}
        >
          {stickerGroups.length === 0 && <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>No stickers yet - open a box!</p>}
          {stickerGroups.map(([id, list]) => {
            const first = list[0]
            return (
              <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                {first.kind === 'emoji' ? (
                  <span style={{ fontSize: '2rem' }}>{first.value}</span>
                ) : (
                  <img src={first.value} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                )}
                {list.length > 1 && <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>×{list.length}</span>}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'stickers' && <BadgeShelf />}

      {tab === 'tickets' && redeemMsg && (
        <div className="cc-card" style={{ padding: '1rem', background: 'var(--cc-bg)', fontWeight: 700 }}>{redeemMsg}</div>
      )}
      {redeeming && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,18,43,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            zIndex: 50,
          }}
        >
          <div className="cc-card" style={{ padding: '1.25rem', maxWidth: 420, width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
              Hand over {redeeming.emoji} {redeeming.name}
            </h2>
            <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>A grown-up enters the PIN to mark this ticket as redeemed.</p>
            <PinGate
              pin={progress.settings.pin}
              onUnlock={() => {
                const id = redeeming.id
                const name = redeeming.name
                update('rewards', (r) => ({
                  ...r,
                  tickets: r.tickets.map((x) => (x.id === id ? { ...x, redeemedAt: Date.now() } : x)),
                }))
                fireConfetti('small')
                setRedeeming(null)
                setRedeemMsg(`Enjoy your ${name}, ${progress.settings.kidName}! 🎉`)
              }}
            />
            <button type="button" className="cc-btn cc-btn-surface" onClick={() => setRedeeming(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {tab === 'tickets' && (
        <div className="cc-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {tickets.length === 0 && <p style={{ margin: 0, color: 'var(--cc-ink-soft)' }}>No tickets yet.</p>}
          {tickets.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.75rem',
                background: t.redeemedAt ? 'var(--cc-bg)' : 'var(--cc-surface)',
                border: '1px solid var(--cc-border)',
                opacity: t.redeemedAt ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>🎟️</span>
              <span style={{ fontWeight: 700, flex: 1 }}>
                {t.emoji} {t.name}
              </span>
              {t.redeemedAt ? (
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--cc-ink-soft)' }}>
                  Redeemed {new Date(t.redeemedAt).toLocaleDateString()}
                </span>
              ) : (
                <button
                  type="button"
                  className="cc-btn cc-btn-primary"
                  style={{ minHeight: 44, padding: '0 0.9rem' }}
                  onClick={() => setRedeeming(t)}
                >
                  Redeem 🎟️
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
