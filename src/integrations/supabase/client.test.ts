import { describe, expect, it } from 'vitest'
import { normalizeSupabaseUrl } from './client'

describe('normalizeSupabaseUrl', () => {
  it('adds a scheme when one was left off', () => {
    // The exact mistake that made the first Vercel deploy render a blank page.
    expect(normalizeSupabaseUrl('nrcuimthlkqpecffdvmr.supabase.co')).toBe('https://nrcuimthlkqpecffdvmr.supabase.co')
  })

  it('keeps a URL that already has one', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co')).toBe('https://abc.supabase.co')
    expect(normalizeSupabaseUrl('http://localhost:54321')).toBe('http://localhost:54321')
  })

  it('trims spaces and trailing slashes', () => {
    expect(normalizeSupabaseUrl('  https://abc.supabase.co/  ')).toBe('https://abc.supabase.co')
  })

  it('treats missing or empty as unset, so the app falls back to demo mode', () => {
    expect(normalizeSupabaseUrl(undefined)).toBeUndefined()
    expect(normalizeSupabaseUrl('   ')).toBeUndefined()
  })
})
