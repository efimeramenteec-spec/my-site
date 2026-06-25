import { Toggle } from 'efimeramente-ds'

export const States = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '24px 28px', background: '#f5f3f0' }}>
    <Toggle checked={true}  label="Notificaciones por WhatsApp" />
    <Toggle checked={false} label="Recordatorio 24h antes" />
    <Toggle checked={true}  label="Modo autónomo activado" />
    <Toggle checked={false} label="Sincronización en pausa" />
  </div>
)

export const Disabled = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '24px 28px', background: '#f5f3f0' }}>
    <Toggle checked={false} disabled label="Función no disponible" />
    <Toggle checked={true}  disabled label="Ajuste bloqueado por admin" />
  </div>
)
