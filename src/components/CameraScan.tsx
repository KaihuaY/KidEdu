import { useEffect, useMemo, useRef, useState } from 'react'
import { TwistyCube } from './TwistyCube'
import { CUBE_COLORS } from '../content/colors'
import type { Face } from '../engine/cube'
import {
  LOW_CONFIDENCE_THRESHOLD,
  SCAN_ORDER,
  averagePatch,
  classifySticker,
  faceletsFromCaptures,
  referenceColors,
  type FaceCapture,
  type Rgb,
} from '../engine/cubeScan'

export interface CameraScanProps {
  /** Current facelet string (from ColorNet / a previous scan) - low-confidence
   * or un-photographed stickers fall back to whatever is here. */
  initialFacelets: string
  onDone: (facelets: string) => void
  onCancel: () => void
}

const FACE_INSTRUCTIONS: Record<Face, string> = {
  F: 'Hold it with YELLOW on top and GREEN facing the camera.',
  R: 'Turn the cube so ORANGE faces the camera. Keep yellow on top.',
  B: 'Turn it again: BLUE faces the camera. Yellow still on top.',
  L: 'Once more: RED faces the camera. Yellow still on top.',
  U: 'Now tip the cube toward the camera so YELLOW faces it. Green is at the bottom.',
  D: 'Tip it the other way so WHITE faces the camera. Green is at the top.',
}

// setupAlg for each holding pose. 'z2' is the house convention (see
// src/content/lessons.ts) that puts TwistyCube in the app's canonical
// yellow-top / green-front frame; the rotation appended after it is the
// physical move that gets Nora from that reference pose to each instruction
// above. Derived and cross-checked against src/engine/cube.ts's own move
// tables (applyAlg(SOLVED, <rotation>) and reading the centre facelets) -
// see the "Photo order vs. facelet order" comment at the top of
// src/engine/cubeScan.ts for the full reasoning. Not runtime-verified in an
// actual browser (see TwistyCube.tsx's own header for the same caveat about
// setupAlg rotations).
const FACE_SETUP_ALG: Record<Face, string> = {
  F: 'z2',
  R: 'z2 y',
  B: 'z2 y2',
  L: "z2 y'",
  U: "z2 x'",
  D: 'z2 x',
}

type Phase = 'closed' | 'live' | 'preview' | 'error'

interface CameraErrorInfo {
  message: string
}

function describeCameraError(err: unknown): CameraErrorInfo {
  const name =
    err instanceof DOMException
      ? err.name
      : err && typeof err === 'object' && 'name' in err
        ? String((err as { name: unknown }).name)
        : undefined
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { message: "I can't see yet. Ask a grown-up to allow the camera for this app." }
  }
  return { message: 'Something went wrong opening the camera. You can still tap the colours.' }
}

function cameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

const GUIDE_SIZE = 'min(70vw, 360px)'

export function CameraScan({ initialFacelets, onDone, onCancel }: CameraScanProps) {
  const [faceIndex, setFaceIndex] = useState(0)
  const [captures, setCaptures] = useState<FaceCapture[]>([])
  const [phase, setPhase] = useState<Phase>(() => (cameraSupported() ? 'closed' : 'error'))
  const [errorInfo, setErrorInfo] = useState<CameraErrorInfo | null>(() =>
    cameraSupported()
      ? null
      : { message: "This browser can't use the camera. You can still tap the colours." },
  )
  const [previewSamples, setPreviewSamples] = useState<Rgb[] | null>(null)
  const [mirrored, setMirrored] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const face = SCAN_ORDER[faceIndex]
  const isLastFace = faceIndex === SCAN_ORDER.length - 1
  const capturedFaces = useMemo(() => new Set(captures.map((c) => c.face)), [captures])
  const refs = useMemo(() => referenceColors(captures), [captures])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  // Always stop the camera when the overlay goes away, however that happens.
  useEffect(() => stopStream, [])

  // The <video> only mounts once the phase is 'live', which is *after*
  // getUserMedia resolves - so attach the stream here, once the element
  // exists, rather than only inside openCamera() where the ref is still null.
  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (phase !== 'live' || !video || !stream || video.srcObject === stream) return
    video.srcObject = stream
    video.play().catch(() => {
      // Autoplay can reject on some browsers even right after a tap; the
      // <video autoPlay> attribute will still kick it off.
    })
  }, [phase])

  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      const settings = track?.getSettings()
      setMirrored(settings?.facingMode === 'user')
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch {
          // Autoplay can reject on some browsers even right after a tap;
          // the <video autoPlay> attribute will still kick it off.
        }
      }
      setPhase('live')
    } catch (err) {
      setErrorInfo(describeCameraError(err))
      setPhase('error')
    }
  }

  function capture() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // The video preview is shown with object-fit: cover inside a square
    // guide, so only a centred square crop of the raw frame is actually
    // visible - map the 3x3 grid onto that crop, not the full (usually
    // rectangular) camera frame.
    const vw = video.videoWidth
    const vh = video.videoHeight
    let cropX0 = 0
    let cropY0 = 0
    let cropSize: number
    if (vw >= vh) {
      cropSize = vh
      cropX0 = (vw - vh) / 2
    } else {
      cropSize = vw
      cropY0 = (vh - vw) / 2
    }
    const cellSize = cropSize / 3
    const half = cellSize * 0.12

    const samples: Rgb[] = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        // Front cameras get mirrored via CSS for a natural preview; sample
        // the raw (unmirrored) frame but flip which column we read so the
        // sample matches what Nora actually saw on screen.
        const sampleCol = mirrored ? 2 - col : col
        const cx = cropX0 + (sampleCol + 0.5) * cellSize
        const cy = cropY0 + (row + 0.5) * cellSize
        samples.push(averagePatch(frame.data, canvas.width, cx, cy, half))
      }
    }
    video.pause()
    setPreviewSamples(samples)
    setPhase('preview')
  }

  function retake() {
    setPreviewSamples(null)
    videoRef.current?.play().catch(() => {})
    setPhase('live')
  }

  function confirm() {
    if (!previewSamples) return
    const nextCaptures = [...captures.filter((c) => c.face !== face), { face, samples: previewSamples }]
    setCaptures(nextCaptures)
    setPreviewSamples(null)

    if (isLastFace) {
      const { facelets } = faceletsFromCaptures(nextCaptures)
      const merged = facelets
        .split('')
        .map((c, i) => (c === '?' ? (initialFacelets[i] ?? '?') : c))
        .join('')
      stopStream()
      onDone(merged)
      return
    }

    setFaceIndex((i) => i + 1)
    videoRef.current?.play().catch(() => {})
    setPhase('live')
  }

  function cancel() {
    stopStream()
    onCancel()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem',
        paddingTop: 'max(1rem, var(--cc-safe-top))',
        paddingBottom: 'max(1rem, var(--cc-safe-bottom))',
        overflowY: 'auto',
      }}
    >
      {phase !== 'error' && (
        <div
          className="cc-card"
          style={{
            padding: '0.85rem 1rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            width: '100%',
            maxWidth: 420,
          }}
        >
          {/* The wrapper hides cubing.js's control bar under a ~60 px overlay,
              so the box needs real height or the cube itself gets squeezed out. */}
          <div style={{ width: 150, height: 190, flexShrink: 0 }}>
            <TwistyCube setupAlg={FACE_SETUP_ALG[face]} controls="none" />
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--cc-ink)' }}>
            {FACE_INSTRUCTIONS[face]}
          </p>
        </div>
      )}

      {phase === 'error' && errorInfo && (
        <div
          className="cc-card"
          style={{
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            width: '100%',
            maxWidth: 420,
            marginTop: 'auto',
            marginBottom: 'auto',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{errorInfo.message}</p>
          <button type="button" className="cc-btn cc-btn-primary" onClick={cancel}>
            ◀ Back
          </button>
        </div>
      )}

      {phase === 'closed' && (
        <div
          style={{
            width: GUIDE_SIZE,
            aspectRatio: '1 / 1',
            borderRadius: '1.5rem',
            border: '3px dashed rgba(255,255,255,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            className="cc-btn cc-btn-primary"
            style={{ minHeight: 72, fontSize: '1.1rem' }}
            onClick={openCamera}
          >
            📷 Open camera
          </button>
        </div>
      )}

      {(phase === 'live' || phase === 'preview') && (
        <div
          style={{
            position: 'relative',
            width: GUIDE_SIZE,
            aspectRatio: '1 / 1',
            borderRadius: '1.5rem',
            overflow: 'hidden',
            background: '#111',
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: mirrored ? 'scaleX(-1)' : 'none',
              display: 'block',
            }}
          />

          {/* 3x3 guide grid */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(3, 1fr)',
            }}
          >
            {Array.from({ length: 9 }, (_, i) => {
              const row = Math.floor(i / 3)
              const col = i % 3
              const isCenter = i === 4

              let swatch: { hex: string; label: string } | null = null
              if (phase === 'preview' && previewSamples) {
                if (isCenter) {
                  swatch = { hex: CUBE_COLORS[face].hex, label: CUBE_COLORS[face].name }
                } else {
                  const result = classifySticker(previewSamples[i], refs)
                  swatch =
                    result.confidence < LOW_CONFIDENCE_THRESHOLD
                      ? { hex: 'var(--cube-unknown)', label: '?' }
                      : { hex: CUBE_COLORS[result.face].hex, label: CUBE_COLORS[result.face].name }
                }
              }

              return (
                <div
                  key={i}
                  style={{
                    borderTop: row > 0 ? '3px solid rgba(255,255,255,0.85)' : 'none',
                    borderLeft: col > 0 ? '3px solid rgba(255,255,255,0.85)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {swatch && (
                    <div
                      style={{
                        width: '78%',
                        height: '78%',
                        borderRadius: '0.5rem',
                        background: swatch.hex,
                        opacity: 0.9,
                        boxShadow: '0 0 0 2px rgba(0,0,0,0.35)',
                      }}
                    />
                  )}
                  {isCenter && phase === 'live' && (
                    <span
                      style={{
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        textShadow: '0 1px 4px rgba(0,0,0,0.9)',
                        textAlign: 'center',
                        padding: '0 0.3rem',
                      }}
                    >
                      {CUBE_COLORS[face].name} in the middle
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {phase === 'live' && (
        <button
          type="button"
          className="cc-btn cc-btn-primary"
          style={{ minHeight: 72, fontSize: '1.2rem', width: '100%', maxWidth: 420 }}
          onClick={capture}
        >
          📸 Capture
        </button>
      )}

      {phase === 'preview' && (
        <div style={{ display: 'flex', gap: '0.75rem', width: '100%', maxWidth: 420 }}>
          <button
            type="button"
            className="cc-btn cc-btn-surface"
            style={{ flex: 1, minHeight: 72, fontSize: '1.05rem', background: '#fff' }}
            onClick={retake}
          >
            🔁 Retake
          </button>
          <button
            type="button"
            className="cc-btn cc-btn-primary"
            style={{ flex: 1, minHeight: 72, fontSize: '1.05rem' }}
            onClick={confirm}
          >
            {isLastFace ? 'Done ✅' : 'Looks right ✅'}
          </button>
        </div>
      )}

      {phase !== 'error' && (
        <div style={{ display: 'flex', gap: '0.5rem' }} aria-label="Faces scanned">
          {SCAN_ORDER.map((f) => (
            <div
              key={f}
              title={CUBE_COLORS[f].name}
              style={{
                width: 28,
                height: 28,
                borderRadius: '0.4rem',
                background: capturedFaces.has(f) ? CUBE_COLORS[f].hex : 'rgba(255,255,255,0.15)',
                border: f === face ? '2px solid #fff' : '2px solid rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className="cc-btn cc-btn-surface"
        style={{ background: 'rgba(255,255,255,0.9)', marginTop: phase === 'error' ? 0 : 'auto' }}
        onClick={cancel}
      >
        ✖ Cancel
      </button>
    </div>
  )
}
