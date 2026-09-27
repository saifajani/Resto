import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from .env (local) or
// Vercel's Environment Variables (deployed). When they're missing the app runs
// in demo mode instead (see src/lib/config.ts), so this exports null.

/**
 * These values are pasted by hand into .env and into Vercel, so a missing
 * scheme or a stray space is easy to do. Without this, createClient throws at
 * import time and the whole app renders as a blank page.
 */
export function normalizeSupabaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim()

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase: SupabaseClient | null =
  url && key && !url.includes('your-project-ref') ? createClient(url, key) : null
