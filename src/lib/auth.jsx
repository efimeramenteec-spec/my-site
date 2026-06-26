import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabase.js'

const AuthCtx = createContext(null)

/**
 * Auth state for the app.
 * - Demo mode (no anon key): no login required; acts as the owner so the
 *   whole app stays usable on demo data, exactly as before.
 * - Live mode (anon key present): real Supabase Auth. Loads the user's
 *   `profiles` row to know their role ('owner' | 'therapist') and terapeuta_id.
 */
export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setProfile({ role: 'owner', terapeuta_id: null, nombre: 'Nicolas' })
      setLoading(false)
      return
    }

    let active = true

    async function loadProfile(userId) {
      const { data } = await supabase
        .from('profiles')
        .select('role, terapeuta_id, nombre')
        .eq('id', userId)
        .single()
      if (!active) return
      // Default to a no-access therapist if the profile row is missing.
      setProfile(data || { role: 'therapist', terapeuta_id: null, nombre: '' })
      setLoading(false)
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
        if (data.session) loadProfile(data.session.user.id)
        else setLoading(false)
      })
      .catch(() => {
        if (active) setLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return
      setSession(newSession)
      if (newSession) {
        setLoading(true)
        loadProfile(newSession.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      active = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  const value = {
    loading,
    session,
    profile,
    isDemo: !isSupabaseConfigured,
    // Full access = the owner, or anyone in demo mode.
    fullAccess: !isSupabaseConfigured || profile?.role === 'owner',
    terapeutaId: profile?.terapeuta_id || null,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
