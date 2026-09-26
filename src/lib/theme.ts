/**
 * Light / dark appearance. The choice lives in localStorage, and the resolved
 * theme is a `data-theme` attribute on <html> that `styles.css` keys off.
 *
 * The same resolution runs in an inline script in index.html so the first paint
 * is already the right theme. Keep the two in step.
 */
export type ThemeChoice = 'light' | 'dark' | 'auto'

export const THEME_KEY = 'resto:theme'

export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Automatic' },
]

/** 'auto' means whatever the phone or computer is set to. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): 'light' | 'dark' {
  if (choice === 'auto') return systemPrefersDark ? 'dark' : 'light'
  return choice
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'auto'
}

const systemQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (isThemeChoice(stored)) return stored
  } catch {
    // Private browsing can refuse localStorage; fall back to following the system.
  }
  return 'auto'
}

function applyThemeChoice(choice: ThemeChoice) {
  document.documentElement.dataset.theme = resolveTheme(choice, systemQuery().matches)
}

export function saveThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice)
  } catch {
    // Not fatal: the choice still applies for this session.
  }
  applyThemeChoice(choice)
}

/** Keeps 'auto' in step with the system while the app is open. */
export function watchSystemTheme(): () => void {
  const query = systemQuery()
  const onChange = () => applyThemeChoice(readThemeChoice())
  query.addEventListener('change', onChange)
  onChange()
  return () => query.removeEventListener('change', onChange)
}
