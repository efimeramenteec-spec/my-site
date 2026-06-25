import { Badge } from 'efimeramente-ds'

export const AllVariants = () => (
  <div style={{ display: 'flex', gap: '10px', padding: '24px 28px', flexWrap: 'wrap', alignItems: 'center', background: '#f5f3f0' }}>
    <Badge variant="lavender">Activo</Badge>
    <Badge variant="orange">Pendiente</Badge>
    <Badge variant="pink">Cancelado</Badge>
    <Badge variant="yellow">En espera</Badge>
    <Badge variant="neutral">Archivado</Badge>
  </div>
)

export const InContext = () => (
  <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '14px', background: '#f5f3f0' }}>
    {[
      { name: 'María García',    status: 'Activo' as const,    variant: 'lavender' as const },
      { name: 'Carlos López',    status: 'Pendiente' as const,  variant: 'orange' as const   },
      { name: 'Ana Martínez',   status: 'Cancelado' as const,  variant: 'pink' as const     },
      { name: 'Luis Herrera',   status: 'En espera' as const,  variant: 'yellow' as const   },
    ].map(p => (
      <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'Arimo, system-ui, sans-serif', fontSize: '14px', color: '#1a1a1a', gap: '12px' }}>
        <span>{p.name}</span>
        <Badge variant={p.variant}>{p.status}</Badge>
      </div>
    ))}
  </div>
)
