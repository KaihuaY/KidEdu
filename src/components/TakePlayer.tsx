import { useEffect, useState } from 'react'
import type { PianoTake } from '../store/progress'
import { getRecordingStore, useLocalAudioIds } from '../store/recordings'

/**
 * Plays back one piano take, wherever its audio lives: a local blob on this
 * device (lazily loaded as an object URL on first tap, revoked on unmount),
 * the parent's Google Drive copy when this device never recorded it, or a
 * plain note that the audio isn't here at all. Shared by PianoHome's
 * TakeCard and ParentReview so both screens agree on exactly what "play"
 * means for a given take.
 */
export function TakePlayer({ take }: { take: PianoTake }) {
  const localAudioIds = useLocalAudioIds()
  const isLocal = localAudioIds.has(take.id)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loadingAudio, setLoadingAudio] = useState(false)

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  async function handleListen() {
    if (objectUrl || loadingAudio) return
    setLoadingAudio(true)
    try {
      const blob = await getRecordingStore().get(take.id)
      if (blob) setObjectUrl(URL.createObjectURL(blob))
    } finally {
      setLoadingAudio(false)
    }
  }

  if (isLocal) {
    if (objectUrl) return <audio controls playsInline src={objectUrl} style={{ width: '100%' }} />
    return (
      <button
        type="button"
        className="cc-btn cc-btn-surface"
        disabled={loadingAudio}
        onClick={() => void handleListen()}
      >
        ▶ {loadingAudio ? 'Loading…' : 'Listen'}
      </button>
    )
  }

  if (take.upload?.driveUrl) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <audio controls preload="none" src={take.upload.driveUrl} style={{ width: '100%' }} />
        {take.upload.driveFileId && (
          <a
            href={`https://drive.google.com/file/d/${take.upload.driveFileId}/view`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.85rem' }}
          >
            Open in Drive ↗
          </a>
        )}
      </div>
    )
  }

  return (
    <span style={{ color: 'var(--cc-ink-soft)', fontSize: '0.85rem' }}>
      Recorded on another device (not uploaded yet)
    </span>
  )
}
