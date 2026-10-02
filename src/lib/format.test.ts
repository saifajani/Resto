import { describe, expect, it } from 'vitest'
import { loggedAgo } from './format'

describe('loggedAgo', () => {
  const now = new Date(2026, 9, 2, 9, 0)
  const at = (month: number, day: number, hour = 12) => new Date(2026, month, day, hour).toISOString()

  it('counts calendar days, not 24 hour spans', () => {
    expect(loggedAgo(at(9, 2, 1), now)).toBe('today')
    expect(loggedAgo(at(9, 1, 23), now)).toBe('yesterday')
    expect(loggedAgo(at(8, 29), now)).toBe('3 days ago')
  })

  it('switches to weeks after six days', () => {
    expect(loggedAgo(at(8, 25), now)).toBe('last week')
    expect(loggedAgo(at(8, 18), now)).toBe('2 weeks ago')
  })

  it('gives the date once it is over a month old', () => {
    expect(loggedAgo(at(7, 1), now)).toMatch(/^on .*2026/)
  })
})
