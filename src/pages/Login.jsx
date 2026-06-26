import React, { useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { Input } from '../components/Input/Input.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Logo } from '../layout/Logo.jsx'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await signIn(email.trim(), password)
    setLoading(false)
    if (err) setError('Correo o contraseña incorrectos.')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-warm px-6 font-body">
      {/* Ambient orbs */}
      <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 right-[15%] h-[460px] w-[460px] rounded-blob bg-gradient-to-br from-brand-lavender/25 to-brand-pink/15 blur-3xl animate-float" />
        <div className="absolute bottom-[5%] left-[10%] h-[400px] w-[400px] rounded-blob bg-gradient-to-br from-brand-yellow/20 to-brand-orange/15 blur-3xl animate-float-slow" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-card border border-white/80 bg-white/70 p-8 shadow-card backdrop-blur-[12px]"
      >
        <div className="mb-6 text-center">
          <Logo variant="corto" className="mx-auto" />
          <p className="mt-4 font-serif text-lg text-content-secondary">Panel de Control</p>
        </div>

        <div className="space-y-4">
          <Input
            label="Correo electrónico"
            type="email"
            placeholder="tu@efimeramente.ec"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
          <Input
            label="Contraseña"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            error={error}
          />
        </div>

        <Button type="submit" variant="primary" disabled={loading} className="mt-6 w-full justify-center">
          {loading ? 'Entrando…' : 'Entrar'}
        </Button>

        <p className="mt-5 text-center font-caption text-xs text-content-muted">
          Acceso exclusivo del equipo de Efimeramente
        </p>
      </form>
    </div>
  )
}
