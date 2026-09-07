import { describe, expect, it } from 'vitest'
import { extensionFor, pickRecordingMime } from '../mime'

describe('pickRecordingMime', () => {
  it('prefers mp4, then mp4 codecs, then webm opus, then webm, then ogg opus', () => {
    const supported = new Set([
      'audio/mp4',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
    ])
    expect(pickRecordingMime((m) => supported.has(m))).toBe('audio/mp4')
  })

  it('falls through to the next supported type in preference order', () => {
    const webmOnly = new Set(['audio/webm;codecs=opus', 'audio/webm'])
    expect(pickRecordingMime((m) => webmOnly.has(m))).toBe('audio/webm;codecs=opus')

    const plainWebmOnly = new Set(['audio/webm'])
    expect(pickRecordingMime((m) => plainWebmOnly.has(m))).toBe('audio/webm')

    const oggOnly = new Set(['audio/ogg;codecs=opus'])
    expect(pickRecordingMime((m) => oggOnly.has(m))).toBe('audio/ogg;codecs=opus')
  })

  it('returns null when nothing is supported', () => {
    expect(pickRecordingMime(() => false)).toBeNull()
  })

  it('returns null when no isSupported function is given and MediaRecorder is unavailable', () => {
    // The test environment is node, so the global MediaRecorder is absent -
    // this exercises the same fallback a very old browser would hit.
    expect(pickRecordingMime()).toBeNull()
  })
})

describe('extensionFor', () => {
  it('maps mp4 variants to m4a', () => {
    expect(extensionFor('audio/mp4')).toBe('m4a')
    expect(extensionFor('audio/mp4;codecs=mp4a.40.2')).toBe('m4a')
  })

  it('maps ogg variants to ogg', () => {
    expect(extensionFor('audio/ogg;codecs=opus')).toBe('ogg')
  })

  it('defaults everything else (webm) to webm', () => {
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm')
    expect(extensionFor('audio/webm')).toBe('webm')
  })
})
