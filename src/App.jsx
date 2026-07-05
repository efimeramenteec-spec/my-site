import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { AppShell } from './layout/AppShell.jsx'
import Login from './pages/Login.jsx'
import Sesiones from './pages/Sesiones.jsx'
import Pacientes from './pages/Pacientes.jsx'
import Seguimiento from './pages/Seguimiento.jsx'
import Finanzas from './pages/Finanzas.jsx'
import DesignSystem from './pages/DesignSystem.jsx'
import Disponibilidad from './pages/Disponibilidad.jsx'
import Marketing from './pages/Marketing.jsx'
import PublicBooking from './pages/PublicBooking.jsx'

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-warm">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-lavender/30 border-t-brand-lavender" />
    </div>
  )
}

function Gate() {
  const { loading, session, fullAccess, isDemo } = useAuth()
  if (loading) return <Splash />
  if (!isDemo && !session) return <Login />

  return (
    <Routes>
      <Route element={<AppShell />}>
        {fullAccess ? (
          <>
            {/* Finanzas absorbed the old Dashboard (2026-07-04) — it IS the
                home page now; the /finanzas placeholder route is gone. */}
            <Route index element={<Finanzas />} />
            <Route path="sesiones" element={<Sesiones />} />
            <Route path="pacientes" element={<Pacientes />} />
            <Route path="seguimiento" element={<Seguimiento />} />
            <Route path="marketing" element={<Marketing />} />
            <Route path="disponibilidad" element={<Disponibilidad />} />
            <Route path="ds" element={<DesignSystem />} />
          </>
        ) : (
          // Therapists: scheduling, their own public-booking availability,
          // and Seguimiento (RLS scopes it to their own patients/sessions).
          <>
            <Route index element={<Navigate to="/sesiones" replace />} />
            <Route path="sesiones" element={<Sesiones />} />
            <Route path="seguimiento" element={<Seguimiento />} />
            <Route path="disponibilidad" element={<Disponibilidad />} />
          </>
        )}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public booking pages — no auth, no app chrome. They talk only to
              the public-booking Netlify function, never to Supabase directly.
              /agendar = free 10-min llamada; /reservar = real individual
              session (link shared privately by the practice). */}
          <Route path="/agendar/*" element={<PublicBooking />} />
          <Route path="/reservar/*" element={<PublicBooking kind="sesion" />} />
          <Route path="/*" element={<Gate />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
