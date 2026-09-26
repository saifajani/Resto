import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from .env (local) or
// Vercel's Environment Variables (deployed). When they're missing the app runs
// in demo mode instead (see src/lib/config.ts), so this exports null.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase: SupabaseClient | null =
  url && key && !url.includes('your-project-ref') ? createClient(url, key) : null
