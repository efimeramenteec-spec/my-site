import React, { useState } from 'react'
import { Button, Card, Badge, Input, Toggle, Select } from '../components/index.js'

/** Reference gallery for the Efimeramente DS components. Route: /ds */
export default function DesignSystem() {
  const [notif, setNotif] = useState(true)
  const [reminder, setReminder] = useState(false)

  return (
    <div className="space-y-8 pt-2">
      <Card withOrbs>
        <h2 className="font-serif text-2xl font-bold text-content-primary mb-6">Buttons</h2>
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

      <Card>
        <h2 className="font-serif text-2xl font-bold text-content-primary mb-6">Badges</h2>
        <div className="flex flex-wrap gap-3">
          <Badge variant="lavender">Activo</Badge>
          <Badge variant="orange">Pendiente</Badge>
          <Badge variant="pink">Cancelado</Badge>
          <Badge variant="yellow">En espera</Badge>
          <Badge variant="neutral">Archivado</Badge>
        </div>
      </Card>

      <Card withOrbs>
        <h2 className="font-serif text-2xl font-bold text-content-primary mb-6">Form Controls</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
          <Input label="Nombre del paciente" placeholder="Ej. María García" type="text" />
          <Input label="Correo electrónico" placeholder="maria@ejemplo.com" type="email" />
          <Select
            label="Tipo de sesión"
            options={[
              { value: 'individual', label: 'Sesión individual' },
              { value: 'pareja', label: 'Terapia de pareja' },
              { value: 'familia', label: 'Terapia familiar' },
              { value: 'grupo', label: 'Sesión grupal' },
            ]}
          />
          <Select label="Terapeuta" options={[{ value: 'mariana', label: 'Psic. Mariana Villegas' }]} />
        </div>
        <div className="mt-6 space-y-4">
          <Toggle label="Notificaciones por WhatsApp" checked={notif} onChange={setNotif} />
          <Toggle label="Recordatorio 24h antes" checked={reminder} onChange={setReminder} />
        </div>
      </Card>
    </div>
  )
}
