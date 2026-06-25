import React from 'react'
import { Placeholder } from './_Placeholder.jsx'
import { IconCalendar } from '../layout/icons.jsx'

export default function Sesiones() {
  return (
    <Placeholder
      icon={IconCalendar}
      title="Sesiones"
      description="Calendario semanal/mensual y alta de sesiones con formulario poka-yoke — el reemplazo interno de Calendly."
      eta="Siguiente fase"
    />
  )
}
