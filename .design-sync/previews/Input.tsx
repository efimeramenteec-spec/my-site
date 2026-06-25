import { Input } from 'efimeramente-ds'

export const Default = () => (
  <div style={{ padding: '24px 28px', maxWidth: '380px', background: '#f5f3f0' }}>
    <Input label="Nombre del paciente" placeholder="Ej. María García" />
  </div>
)

export const WithHint = () => (
  <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '380px', background: '#f5f3f0' }}>
    <Input label="Correo electrónico" placeholder="maria@ejemplo.com" type="email" hint="Recibirá recordatorios aquí" />
    <Input label="Teléfono" placeholder="+52 55 1234 5678" type="tel" hint="Formato: +52 (país) + número" />
  </div>
)

export const WithError = () => (
  <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '380px', background: '#f5f3f0' }}>
    <Input label="Nombre" placeholder="Ingresa tu nombre" error="Este campo es requerido" />
    <Input label="Correo" placeholder="correo@ejemplo.com" error="Formato de correo inválido" />
  </div>
)

export const Disabled = () => (
  <div style={{ padding: '24px 28px', maxWidth: '380px', background: '#f5f3f0' }}>
    <Input label="ID Paciente" value="P-2024-001" disabled hint="Asignado automáticamente" />
  </div>
)
