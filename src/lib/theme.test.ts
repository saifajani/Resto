import { describe, expect, it } from 'vitest'
import { isThemeChoice, resolveTheme } from './theme'

describe('resolveTheme', () => {
  it('follows the system when the choice is automatic', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
  })

  it('ignores the system when the choice is explicit', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('isThemeChoice', () => {
  it('accepts only the three choices', () => {
    expect(['light', 'dark', 'auto'].every(isThemeChoice)).toBe(true)
    expect(isThemeChoice('sepia')).toBe(false)
    expect(isThemeChoice(null)).toBe(false)
  })
})
