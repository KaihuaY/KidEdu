// A small dependency-free SVG bar chart for a daily count (e.g. plays per
// day), with an optional thin trend line for a second measure (e.g. minutes)
// drawn on its own scale - see the `dataviz` skill: bars are the primary
// mark (rounded top, square at the baseline, a 2px surface gap between
// bars), the line is a light accent overlay with no axis of its own (no
// second set of ticks is drawn, so this stays a trend accent rather than a
// true dual-axis chart). Text labels use ink tokens, never the mark colors.
// `compact` renders a bare, label-free sparkline for inline use (e.g. one
// row per song in the songs list); the full form adds a title, the max
// value (printed once), and first/last day labels.

export interface MiniBarPoint {
  label: string
  value: number
  /** A second measure in the same unit as `value`'s underlying source (seconds); drawn as minutes (secondary / 60) on its own scale. */
  secondary?: number
}

interface MiniBarChartProps {
  points: MiniBarPoint[]
  title: string
  unit?: string
  compact?: boolean
}

const WIDTH = 300
const HEIGHT = 100
const PAD_X = 12
const PAD_TOP = 18
const PAD_BOTTOM = 20
const GAP = 2
const BAR_RADIUS = 3

const COMPACT_WIDTH = 120
const COMPACT_HEIGHT = 28
const COMPACT_GAP = 1

/** A bar path rounded at the top (the data end) and square at the baseline. */
function roundedTopBarRect(x: number, yTop: number, w: number, yBase: number, r: number): string {
  const h = yBase - yTop
  if (h <= 0) return ''
  const radius = Math.min(r, w / 2, h)
  if (radius <= 0.5) {
    return `M${x},${yBase} L${x},${yTop} L${x + w},${yTop} L${x + w},${yBase} Z`
  }
  return [
    `M${x},${yBase}`,
    `L${x},${yTop + radius}`,
    `Q${x},${yTop} ${x + radius},${yTop}`,
    `L${x + w - radius},${yTop}`,
    `Q${x + w},${yTop} ${x + w},${yTop + radius}`,
    `L${x + w},${yBase}`,
    'Z',
  ].join(' ')
}

export function MiniBarChart({ points, title, unit, compact = false }: MiniBarChartProps) {
  const n = points.length
  const total = points.reduce((s, p) => s + p.value, 0)
  const last = points[n - 1]
  const unitSuffix = unit ? ` ${unit}` : ''
  const ariaLabel = last
    ? `${title}: ${total}${unitSuffix} total, most recent ${last.label} ${last.value}${unitSuffix}.`
    : `${title}: no data yet.`

  const width = compact ? COMPACT_WIDTH : WIDTH
  const height = compact ? COMPACT_HEIGHT : HEIGHT
  const padX = compact ? 1 : PAD_X
  const padTop = compact ? 2 : PAD_TOP
  const padBottom = compact ? 2 : PAD_BOTTOM
  const gap = compact ? COMPACT_GAP : GAP

  const usableWidth = width - padX * 2
  const barWidth = n > 0 ? Math.max(1, (usableWidth - gap * (n - 1)) / n) : 0
  const barRadius = compact ? Math.min(1.5, barWidth / 2) : Math.min(BAR_RADIUS, barWidth / 2)
  const baseline = height - padBottom
  const usableHeight = height - padTop - padBottom
  const maxValue = Math.max(1, ...points.map((p) => p.value))

  const xFor = (i: number) => padX + i * (barWidth + gap)
  const barTop = (v: number) => baseline - (v / maxValue) * usableHeight

  const hasSecondary = points.some((p) => p.secondary !== undefined)
  const maxSecondary = hasSecondary ? Math.max(1, ...points.map((p) => (p.secondary ?? 0) / 60)) : 1
  const lineX = (i: number) => xFor(i) + barWidth / 2
  const lineY = (v: number) => baseline - (v / maxSecondary) * usableHeight
  const linePath = hasSecondary
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'}${lineX(i).toFixed(1)},${lineY((p.secondary ?? 0) / 60).toFixed(1)}`).join(' ')
    : ''

  const svg = (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: compact ? width : '100%', maxWidth: compact ? width : 320, height: 'auto', display: 'block' }}
    >
      {points.map((p, i) => {
        const top = barTop(p.value)
        if (top >= baseline) return null
        return <path key={i} d={roundedTopBarRect(xFor(i), top, barWidth, baseline, barRadius)} fill="var(--cc-primary)" />
      })}
      {hasSecondary && <path d={linePath} fill="none" stroke="var(--cc-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {!compact && n > 0 && (
        <>
          <text x={padX} y={padTop - 6} fontSize={9} fill="var(--cc-ink-soft)">
            {maxValue}
            {unitSuffix}
          </text>
          <text x={padX} y={height - 4} fontSize={9} fill="var(--cc-ink-soft)">
            {points[0].label}
          </text>
          <text x={width - padX} y={height - 4} fontSize={9} fill="var(--cc-ink-soft)" textAnchor="end">
            {points[n - 1].label}
          </text>
        </>
      )}
    </svg>
  )

  if (compact) return svg

  return (
    <div className="cc-card" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <strong style={{ fontSize: '0.9rem' }}>{title}</strong>
      {svg}
    </div>
  )
}
