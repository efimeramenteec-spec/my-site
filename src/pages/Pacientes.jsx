import React from 'react'
import { Placeholder } from './_Placeholder.jsx'
import { IconUsers } from '../layout/icons.jsx'

export default function Pacientes() {
  return (
    <Placeholder
      icon={IconUsers}
      title="Pacientes"
      description="Listado y ficha de cada paciente con historial de sesiones y bitácora de WhatsApp — el reemplazo de Zapier + Google Sheets."
      eta="Siguiente fase"
    />
  )
}
