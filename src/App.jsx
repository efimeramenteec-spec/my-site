import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './layout/AppShell.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Sesiones from './pages/Sesiones.jsx'
import Pacientes from './pages/Pacientes.jsx'
import Seguimiento from './pages/Seguimiento.jsx'
import Finanzas from './pages/Finanzas.jsx'
import DesignSystem from './pages/DesignSystem.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="sesiones" element={<Sesiones />} />
          <Route path="pacientes" element={<Pacientes />} />
          <Route path="seguimiento" element={<Seguimiento />} />
          <Route path="finanzas" element={<Finanzas />} />
          <Route path="ds" element={<DesignSystem />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
