import React from 'react'
import { NavLink } from 'react-router-dom'
import { Logo } from './Logo.jsx'
import {
  IconDashboard,
  IconCalendar,
  IconUsers,
  IconPulse,
  IconWallet,
  IconSparkle,
} from './icons.jsx'

export const NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/sesiones', label: 'Sesiones', icon: IconCalendar },
  { to: '/pacientes', label: 'Pacientes', icon: IconUsers },
  { to: '/seguimiento', label: 'Seguimiento', icon: IconPulse },
  { to: '/finanzas', label: 'Finanzas', icon: IconWallet },
]

const itemClass = ({ isActive }) =>
  [
    'group flex items-center gap-3 rounded-pill px-4 py-3',
    'font-heading font-bold text-sm transition-all duration-300 ease-out',
    isActive
      ? 'bg-brand-gradient text-white shadow-soft'
      : 'text-content-secondary hover:bg-white/70 hover:text-content-primary',
  ].join(' ')

/** Fixed left rail — desktop / tablet (lg and up). */
export function Sidebar() {
  return (
    <aside className="hidden lg:flex fixed top-0 left-0 z-30 h-screen w-[260px] flex-col px-5 py-7 bg-white/60 backdrop-blur-[14px] border-r border-white/70">
      <div className="px-3 pb-8">
        <Logo variant="corto" />
      </div>

      <nav className="flex flex-col gap-1.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={itemClass}>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto">
        <div className="flex items-center gap-3 rounded-card bg-white/70 border border-white/80 px-4 py-3 shadow-soft">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
            <IconSparkle size={16} />
          </div>
          <div className="leading-tight">
            <p className="font-heading text-sm font-bold text-content-primary">Panel interno</p>
            <p className="font-caption text-xs text-content-muted">Efimeramente</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

/** Bottom tab bar — mobile (below lg). PWA-friendly. */
export function MobileNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch justify-around bg-white/80 backdrop-blur-[14px] border-t border-white/70 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            [
              'flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition-colors duration-200',
              isActive ? 'text-brand-lavender' : 'text-content-muted',
            ].join(' ')
          }
        >
          <Icon size={21} />
          <span className="font-caption text-[10px] font-bold">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
