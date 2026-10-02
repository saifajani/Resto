export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * When something was logged, in calendar days: "today", "yesterday",
 * "3 days ago", "2 weeks ago", then the plain date past about a month.
 */
export function loggedAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (days <= 0) return 'today'
  if (days < 7) return rtf.format(-days, 'day')
  if (days < 31) return rtf.format(-Math.floor(days / 7), 'week')
  return `on ${formatDate(iso)}`
}
