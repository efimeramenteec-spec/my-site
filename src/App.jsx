import React, { useState } from 'react'
import { Button, Card, Badge, Input, Toggle, Select } from './components/index.js'

export default function App() {
  const [notif, setNotif] = useState(true)
  const [reminder, setReminder] = useState(false)

  return (
    <div className="min-h-screen bg-surface-warm font-body relative overflow-hidden">
      {/* Ambient background orbs */}
      <div aria-hidden="true" className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-blob bg-gradient-to-br from-brand-lavender/15 to-brand-pink/10 blur-3xl animate-float" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] rounded-blob bg-gradient-to-br from-brand-yellow/15 to-brand-orange/10 blur-3xl animate-float-slow" />
        <div className="absolute top-3/4 right-1/3 w-64 h-64 rounded-blob bg-gradient-to-br from-brand-pink/10 to-brand-lavender/10 blur-2xl" />
      </div>

      <div className="max-w-[1200px] mx-auto px-8 py-16 space-y-10">

        {/* Header */}
        <div className="space-y-2">
          <h1 className="font-display text-5xl font-bold text-content-primary">
            efimeramente<span className="text-brand-lavender">✦</span>
          </h1>
          <p className="font-serif text-xl text-content-secondary">
            Design System — Component Library
          </p>
        </div>

        {/* Buttons */}
        <Card withOrbs>
          <h2 className="font-serif text-2xl font-bold text-content-primary mb-6">
            Buttons
          </h2>
          <div className="flex flex-wrap gap-4 items-center">
            <Button variant="primary">Agendar sesión</Button>
            <Button variant="secondary">Ver historial</Button>
            <Button variant="ghost">Cancelar</Button>
          </div>
          <div className="flex flex-wrap gap-4 items-center mt-4">
            <Button variant="primary" size="sm">Pequeño</Button>
            <Button variant="primary" size="md">Mediano</Button>
            <Button variant="primary" size="lg">Grande</Button>
            <Button variant="primary" disabled>Deshabilitado</Button>
          </div>
        </Card>

        {/* Badges */}
        <Card>
          <h2 className="font-serif text-2xl font-bold text-content-primary mb-6">
            Badges
          </h2>
          <div className="flex flex-wrap gap-3">
            <Badge variant="lavender">Activo</Badge>
            <Badge variant="orange">Pendiente</Badge>
            <Badge variant="pink">Cancelado</Badge>
            <Badge variant="yellow">En espera</Badge>
            <Badge variant="neutral">Archivado</Badge>
          </div>
        </Card>

        {/* Form Controls */}
        <Card withOrbs>
          <h2 className="font-serif text-2xl font-bold text-content-primary mb-6">
            Form Controls
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
            <Input
              label="Nombre del paciente"
              placeholder="Ej. María García"
              type="text"
            />
            <Input
              label="Correo electrónico"
              placeholder="maria@ejemplo.com"
              type="email"
            />
            <Input
              label="Campo con error"
              placeholder="Ingresa un valor"
              error="Este campo es requerido"
            />
            <Input
              label="Campo con sugerencia"
              placeholder="Opcional"
              hint="Solo visible para administradores"
            />
            <Select
              label="Tipo de sesión"
              options={[
                { value: 'individual', label: 'Sesión individual' },
                { value: 'pareja', label: 'Terapia de pareja' },
                { value: 'familiar', label: 'Terapia familiar' },
                { value: 'grupal', label: 'Sesión grupal' },
              ]}
            />
            <Select
              label="Terapeuta"
              options={[
                { value: 'mariana', label: 'Psic. Mariana Villegas' },
              ]}
            />
          </div>
          <div className="mt-6 space-y-4">
            <Toggle
              label="Notificaciones por WhatsApp"
              checked={notif}
              onChange={setNotif}
            />
            <Toggle
              label="Recordatorio 24h antes"
              checked={reminder}
              onChange={setReminder}
            />
            <Toggle
              label="Opción deshabilitada"
              checked={false}
              disabled
            />
          </div>
        </Card>

        {/* Card variants */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <p className="font-heading font-bold text-sm text-content-secondary mb-1">
              Sesiones este mes
            </p>
            <p className="font-display text-4xl font-bold text-content-primary">24</p>
            <Badge variant="lavender" className="mt-3">+8% vs anterior</Badge>
          </Card>
          <Card withOrbs>
            <p className="font-heading font-bold text-sm text-content-secondary mb-1">
              Próxima sesión
            </p>
            <p className="font-serif text-xl font-bold text-content-primary">
              Hoy, 5:00 PM
            </p>
            <p className="font-body text-sm text-content-secondary mt-1">
              María García — Individual
            </p>
            <Button variant="primary" size="sm" className="mt-4">Ver detalles</Button>
          </Card>
          <Card>
            <p className="font-heading font-bold text-sm text-content-secondary mb-1">
              Mensajes sin leer
            </p>
            <p className="font-display text-4xl font-bold text-content-primary">3</p>
            <Badge variant="pink" className="mt-3">Requieren atención</Badge>
          </Card>
        </div>

      </div>
    </div>
  )
}
