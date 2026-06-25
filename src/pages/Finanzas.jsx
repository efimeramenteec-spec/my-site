import React from 'react'
import { Placeholder } from './_Placeholder.jsx'
import { IconWallet } from '../layout/icons.jsx'

export default function Finanzas() {
  return (
    <Placeholder
      icon={IconWallet}
      title="Finanzas"
      description="Libro de ingresos y egresos desde la tabla de facturas, totales mensuales y registro de pagos."
      eta="Siguiente fase"
    />
  )
}
