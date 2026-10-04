import { useState, type ReactNode } from 'react'

/** A fold-away row on the done screen: one 56px header line, the content only mounted while open. */
export function DoneRow({
  id,
  icon,
  title,
  status,
  attention,
  defaultOpen = false,
  children,
}: {
  id: string
  icon: string
  title: string
  /** Short text on the right when closed, e.g. '8/10' or the chosen song. */
  status?: string
  /** Shows a small accent dot: this row would like an answer today. */
  attention?: boolean
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="cc-card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        data-testid={`done-row-${id}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          minHeight: 56,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0 1rem',
          background: 'none',
          border: 'none',
          fontFamily: 'inherit',
          fontWeight: 700,
          fontSize: '1rem',
          color: 'var(--cc-ink)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span aria-hidden="true">{icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
        {attention && !open && (
          <span
            data-testid={`done-row-${id}-dot`}
            aria-hidden="true"
            style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--cc-accent)', flexShrink: 0 }}
          />
        )}
        {status && (
          <span
            style={{
              color: 'var(--cc-ink-soft)',
              fontSize: '0.9rem',
              maxWidth: '45%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {status}
          </span>
        )}
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          data-testid={`done-row-${id}-body`}
          style={{ padding: '0 0.75rem 0.9rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
