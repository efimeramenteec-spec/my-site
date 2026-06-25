import React from 'react'
import { Placeholder } from './_Placeholder.jsx'
import { IconPulse } from '../layout/icons.jsx'

export default function Seguimiento() {
  return (
    <Placeholder
      icon={IconPulse}
      title="Seguimiento"
      description="Retención de pacientes, sesiones por terapeuta, tasa de inasistencia y pagos pendientes — con gráficas."
      eta="Siguiente fase"
    />
  )
}
