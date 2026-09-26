import { setTheme, useTheme } from '../store/theme'

/** Header 🌙/☀️ button that flips this device's Light/Dark preference (src/store/theme.ts). */
export function ThemeToggle() {
  const theme = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className="cc-btn cc-btn-surface"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      data-testid="theme-toggle"
      style={{ minWidth: 56, minHeight: 56, padding: '0.5rem', fontSize: '1.3rem', flexShrink: 0 }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}
