import { createClient } from '@supabase/supabase-js'

// Vite exposes env vars prefixed with VITE_ at build time.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * True only when BOTH the URL and anon key are present.
 * The whole app keys off this flag: when false, the data layer
 * serves realistic demo data instead of hitting the network.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
