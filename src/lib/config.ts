import { supabase } from '@/integrations/supabase/client'
import type { Backend } from './backend'
import { createDemoBackend } from './demoBackend'
import { createSupabaseBackend } from './supabaseBackend'

/** Supabase when configured, otherwise a demo that keeps data in this browser. */
export const backend: Backend = supabase ? createSupabaseBackend(supabase) : createDemoBackend()
