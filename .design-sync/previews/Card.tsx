import { Card } from 'efimeramente-ds'

export const Basic = () => (
  <div style={{ padding: '28px', background: '#f5f3f0', minHeight: '160px' }}>
    <Card>
      <p style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '18px', color: '#1a1a1a', margin: 0, lineHeight: 1.5 }}>
        Tarjeta glassmorfismo — fondo blanco semitransparente, bordes suaves y sombra difuminada.
      </p>
    </Card>
  </div>
)

export const WithOrbs = () => (
  <div style={{ padding: '28px', background: '#f5f3f0', minHeight: '200px' }}>
    <Card withOrbs>
      <p style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 700, fontSize: '13px', color: '#6b6b6b', margin: '0 0 4px' }}>
        Próxima sesión
      </p>
      <p style={{ fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, fontSize: '22px', color: '#1a1a1a', margin: '0 0 4px' }}>
        Hoy, 5:00 PM
      </p>
      <p style={{ fontFamily: 'Arimo, system-ui, sans-serif', fontSize: '14px', color: '#6b6b6b', margin: 0 }}>
        María García — Sesión individual
      </p>
    </Card>
  </div>
)

export const Stats = () => (
  <div style={{ padding: '28px', background: '#f5f3f0', display: 'flex', gap: '16px' }}>
    <Card style={{ flex: 1 }}>
      <p style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '12px', color: '#6b6b6b', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sesiones</p>
      <p style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: '36px', color: '#1a1a1a', margin: 0 }}>24</p>
    </Card>
    <Card style={{ flex: 1 }}>
      <p style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '12px', color: '#6b6b6b', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pacientes</p>
      <p style={{ fontFamily: 'Playfair Display, serif', fontWeight: 700, fontSize: '36px', color: '#1a1a1a', margin: 0 }}>12</p>
    </Card>
  </div>
)
