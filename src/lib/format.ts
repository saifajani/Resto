export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
