import { Button } from 'efimeramente-ds'

export const Primary = () => (
  <div style={{ display: 'flex', gap: '12px', padding: '24px 28px', flexWrap: 'wrap', alignItems: 'center', background: '#f5f3f0' }}>
    <Button variant="primary" size="sm">Pequeño</Button>
    <Button variant="primary" size="md">Agendar sesión</Button>
    <Button variant="primary" size="lg">Comenzar ahora</Button>
  </div>
)

export const Secondary = () => (
  <div style={{ display: 'flex', gap: '12px', padding: '24px 28px', alignItems: 'center', background: '#f5f3f0' }}>
    <Button variant="secondary" size="sm">Cancelar</Button>
    <Button variant="secondary" size="md">Ver historial</Button>
    <Button variant="secondary" size="lg">Explorar más</Button>
  </div>
)

export const Ghost = () => (
  <div style={{ display: 'flex', gap: '16px', padding: '24px 28px', alignItems: 'center', background: '#f5f3f0' }}>
    <Button variant="ghost">Cancelar</Button>
    <Button variant="ghost">Ver detalles</Button>
    <Button variant="ghost">Omitir</Button>
  </div>
)

export const Disabled = () => (
  <div style={{ display: 'flex', gap: '12px', padding: '24px 28px', alignItems: 'center', background: '#f5f3f0' }}>
    <Button variant="primary" disabled>Procesando…</Button>
    <Button variant="secondary" disabled>No disponible</Button>
  </div>
)
