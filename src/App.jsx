import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { AppShell } from './layout/AppShell.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Sesiones from './pages/Sesiones.jsx'
import Pacientes from './pages/Pacientes.jsx'
import Seguimiento from './pages/Seguimiento.jsx'
import Finanzas from './pages/Finanzas.jsx'
import DesignSystem from './pages/DesignSystem.jsx'

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
            <Route index element={<Dashboard />} />
            <Route path="sesiones" element={<Sesiones />} />
            <Route path="pacientes" element={<Pacientes />} />
            <Route path="seguimiento" element={<Seguimiento />} />
            <Route path="finanzas" element={<Finanzas />} />
            <Route path="ds" element={<DesignSystem />} />
          </>
        ) : (
          // Therapists: scheduling only.
          <>
            <Route index element={<Navigate to="/sesiones" replace />} />
            <Route path="sesiones" element={<Sesiones />} />
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
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  )
}
