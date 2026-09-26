import { fileURLToPath } from 'node:url'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression guard for dark mode: catches hard-coded light-mode colours that
// sneak back into a .tsx file instead of using the --cc-* theme tokens. A
// small set of files draw over camera video / confetti / waveforms where
// literal white (or the scrim navy) is legitimately theme-independent, so
// they're allowlisted below. A single line whose colour is genuinely
// theme-independent (a sticker, a box tier) can opt out with a 'theme-ok' comment.
const ALLOWLISTED_FILES = new Set([
  'CameraScan.tsx',
  'TeacherNoteViewer.tsx',
  'Confetti.tsx',
  'Aurora.tsx',
  'WaveformBar.tsx',
])

const OFFENDING_PATTERN =
  /#fff\b|#ffffff\b|rgba\(\s*255\s*,\s*255\s*,\s*255|rgba\(\s*16\s*,\s*18\s*,\s*43|#c7cad9|#fff8e6|#fff4f8|#e1e3f5|#cfe8ff/i

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)))

function collectTsxFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      results.push(...collectTsxFiles(fullPath))
    } else if (entry.endsWith('.tsx')) {
      results.push(fullPath)
    }
  }
  return results
}

describe('theme colours', () => {
  it('has no hard-coded light-mode colours outside the allowlisted files', () => {
    const offenders: string[] = []

    for (const file of collectTsxFiles(srcDir)) {
      const baseName = path.basename(file)
      if (ALLOWLISTED_FILES.has(baseName)) continue

      const relativePath = path.relative(srcDir, file).split(path.sep).join('/')
      const lines = readFileSync(file, 'utf8').split(/\r\n|\n/)
      lines.forEach((line, index) => {
        if (OFFENDING_PATTERN.test(line) && !line.includes('theme-ok')) {
          offenders.push(`src/${relativePath}:${index + 1}`)
        }
      })
    }

    expect(
      offenders,
      `Found hard-coded colours that should use a --cc-* theme token instead (or be added to the allowlist if the colour is genuinely theme-independent):\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
