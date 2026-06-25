import React, { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar, MobileNav } from './Sidebar.jsx'
import { TopNav } from './TopNav.jsx'

const TITLES = {
  '/': 'Dashboard',
  '/sesiones': 'Sesiones',
  '/pacientes': 'Pacientes',
  '/seguimiento': 'Seguimiento',
  '/finanzas': 'Finanzas',
  '/ds': 'Design System',
}

export function AppShell() {
  const [dataSource, setDataSource] = useState(null)
  const { pathname } = useLocation()
  const title = TITLES[pathname] || 'Panel'

  // Reset the data-mode chip on navigation; pages report their own source.
  useEffect(() => {
    setDataSource(null)
  }, [pathname])

  return (
    <div className="min-h-screen bg-surface-warm font-body text-content-primary">
      {/* Ambient gradient orbs — fixed background decoration */}
      <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 right-[10%] w-[520px] h-[520px] rounded-blob bg-gradient-to-br from-brand-lavender/20 to-brand-pink/10 blur-3xl animate-float" />
        <div className="absolute bottom-[5%] left-[5%] w-[440px] h-[440px] rounded-blob bg-gradient-to-br from-brand-yellow/18 to-brand-orange/12 blur-3xl animate-float-slow" />
        <div className="absolute top-[45%] left-[40%] w-72 h-72 rounded-blob bg-gradient-to-br from-brand-pink/12 to-brand-lavender/12 blur-2xl animate-float" />
      </div>

      <Sidebar />
      <MobileNav />

      <div className="lg:pl-[260px]">
        <TopNav title={title} source={dataSource} />
        <main className="mx-auto w-full max-w-[1280px] px-6 lg:px-10 pt-2 pb-28 lg:pb-14">
          <Outlet context={{ setDataSource }} />
        </main>
      </div>
    </div>
  )
}
