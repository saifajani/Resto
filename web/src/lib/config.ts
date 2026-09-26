import { createClient } from '@supabase/supabase-js'
import type { Backend } from './backend'
import { createDemoBackend } from './demoBackend'
import { createSupabaseBackend } from './supabaseBackend'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Supabase when configured, otherwise a demo that keeps data in this browser. */
export const backend: Backend =
  url && key && !url.includes('your-project-ref')
    ? createSupabaseBackend(createClient(url, key))
    : createDemoBackend()
