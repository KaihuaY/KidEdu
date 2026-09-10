// Live "aurora" visualizer for the piano Record screen: a canvas of 24
// colourful bars that ease toward the mic's live frequency spectrum, plus
// floating note bubbles spawned on each detected note onset. Purely
// decorative (aria-hidden) - the Record screen's text chip carries the
// actual accessible feedback ("I hear you!" / "Listening...").
//
// Not unit-tested (canvas + rAF + a real mic pipeline aren't worth faking in
// node); kept import-safe by guarding every window/document access inside
// the mount effect, so importing this module never throws outside a browser.

import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribeSpectrum } from '../audio/recordingSession'
import { OnsetDetector } from '../audio/spectrum'

const BAND_COUNT = 24
const ATTACK = 0.5
const DECAY = 0.08
const IDLE_MS = 1000
const IDLE_THRESHOLD = 0.03
const BUBBLE_EMOJIS = ['🎵', '🎶', '♪', '♫']
const MAX_BUBBLES = 10

interface Bubble {
  id: number
  x: number
  emoji: string
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function drawRoundedTopRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h))
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
}

export function Aurora({ source, height = 170 }: { source?: () => Float32Array | null; height?: number } = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const barsRef = useRef<Float32Array>(new Float32Array(BAND_COUNT))
  const latestBandsRef = useRef<Float32Array>(new Float32Array(BAND_COUNT))
  const lastLoudAtRef = useRef<number>(0)
  const onsetRef = useRef(new OnsetDetector())
  const nextBubbleIdRef = useRef(0)
  const [bubbles, setBubbles] = useState<Bubble[]>([])

  const addBubble = useCallback((x: number) => {
    setBubbles((prev) => {
      if (prev.length >= MAX_BUBBLES) return prev
      const emoji = BUBBLE_EMOJIS[Math.floor(Math.random() * BUBBLE_EMOJIS.length)]
      const id = nextBubbleIdRef.current++
      return [...prev, { id, x, emoji }]
    })
  }, [])

  const removeBubble = useCallback((id: number) => {
    setBubbles((prev) => prev.filter((b) => b.id !== id))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const reducedMotion = prefersReducedMotion()
    lastLoudAtRef.current = performance.now()

    function processBands(bands: Float32Array): void {
      latestBandsRef.current = bands

      let energy = 0
      let peakIdx = 0
      let peakVal = -Infinity
      for (let i = 0; i < bands.length; i++) {
        energy += bands[i]
        if (bands[i] > peakVal) {
          peakVal = bands[i]
          peakIdx = i
        }
      }
      energy /= bands.length || 1
      if (peakVal >= IDLE_THRESHOLD) lastLoudAtRef.current = performance.now()

      if (!reducedMotion) {
        const onset = onsetRef.current.push(energy)
        if (onset) {
          const canvas = canvasRef.current
          const w = canvas ? canvas.clientWidth : 0
          if (w > 0) {
            const bandWidth = w / BAND_COUNT
            addBubble(peakIdx * bandWidth + bandWidth / 2)
          }
        }
      }
    }

    // When a `source` is given (replay: read the analyser each frame),
    // there's nothing to subscribe to - the rAF loop below pulls bands
    // itself instead. Otherwise, subscribe to the live mic spectrum as
    // before.
    const unsubscribe = source ? undefined : subscribeSpectrum((bands) => processBands(bands))

    let raf = 0
    let running = true

    function resizeCanvas(): void {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const dpr = window.devicePixelRatio || 1
      const w = container.clientWidth
      const h = container.clientHeight
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
    }

    resizeCanvas()

    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => resizeCanvas())
      ro.observe(containerRef.current)
    } else {
      window.addEventListener('resize', resizeCanvas)
    }

    function draw(): void {
      if (!running) return
      if (source) {
        const bands = source()
        if (bands) processBands(bands)
      }
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const dpr = window.devicePixelRatio || 1
        const w = canvas.width / dpr
        const h = canvas.height / dpr
        ctx.save()
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, w, h)

        const idle = performance.now() - lastLoudAtRef.current > IDLE_MS
        const bars = barsRef.current
        const latest = latestBandsRef.current
        const baseline = h * 0.72
        const barWidth = w / BAND_COUNT
        const gap = Math.max(1, barWidth * 0.18)

        for (let i = 0; i < BAND_COUNT; i++) {
          const target = idle ? 0.08 + 0.04 * Math.sin(performance.now() / 700 + i * 0.5) : latest[i] ?? 0
          const current = bars[i]
          if (reducedMotion) {
            bars[i] = target
          } else {
            const rate = target > current ? ATTACK : DECAY
            bars[i] = current + (target - current) * rate
          }

          const barH = Math.max(2, bars[i] * baseline)
          const x = i * barWidth + gap / 2
          const bw = Math.max(1, barWidth - gap)
          const hue = 205 + i * 6

          const grad = ctx.createLinearGradient(0, baseline, 0, baseline - barH)
          grad.addColorStop(0, `hsl(${hue} 90% 58%)`)
          grad.addColorStop(1, `hsl(${hue} 95% 78%)`)
          ctx.fillStyle = grad
          drawRoundedTopRect(ctx, x, baseline - barH, bw, barH, Math.min(6, bw / 2))
          ctx.fill()

          const reflectH = barH * 0.35
          const reflectGrad = ctx.createLinearGradient(0, baseline, 0, baseline + reflectH)
          reflectGrad.addColorStop(0, `hsla(${hue}, 90%, 58%, 0.22)`)
          reflectGrad.addColorStop(1, `hsla(${hue}, 90%, 58%, 0)`)
          ctx.fillStyle = reflectGrad
          ctx.fillRect(x, baseline, bw, reflectH)
        }

        ctx.restore()
      }
      raf = window.requestAnimationFrame(draw)
    }

    raf = window.requestAnimationFrame(draw)

    return () => {
      running = false
      window.cancelAnimationFrame(raf)
      if (ro) ro.disconnect()
      else window.removeEventListener('resize', resizeCanvas)
      unsubscribe?.()
    }
  }, [addBubble, source])

  return (
    <div ref={containerRef} aria-hidden style={{ position: 'relative', width: '100%', height }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      {bubbles.map((b) => (
        <span
          key={b.id}
          onAnimationEnd={() => removeBubble(b.id)}
          style={{
            position: 'absolute',
            left: b.x,
            bottom: '30%',
            fontSize: '1.5rem',
            animation: 'cc-float 2.2s ease-out forwards',
            pointerEvents: 'none',
          }}
        >
          {b.emoji}
        </span>
      ))}
    </div>
  )
}
