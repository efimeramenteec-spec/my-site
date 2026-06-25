import { Select } from 'efimeramente-ds'

export const Default = () => (
  <div style={{ padding: '24px 28px', maxWidth: '340px', background: '#f5f3f0' }}>
    <Select
      label="Tipo de sesión"
      options={[
        { value: 'individual', label: 'Sesión individual' },
        { value: 'pareja',     label: 'Terapia de pareja' },
        { value: 'familiar',   label: 'Terapia familiar' },
        { value: 'grupal',     label: 'Sesión grupal' },
      ]}
    />
  </div>
)

export const WithSelection = () => (
  <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '340px', background: '#f5f3f0' }}>
    <Select
      label="Terapeuta"
      value="mariana"
      options={[
        { value: 'mariana', label: 'Psic. Mariana Villegas' },
      ]}
    />
    <Select
      label="Duración"
      value="50"
      options={[
        { value: '50',  label: '50 minutos' },
        { value: '80',  label: '80 minutos' },
        { value: '100', label: '100 minutos' },
      ]}
    />
  </div>
)

export const WithError = () => (
  <div style={{ padding: '24px 28px', maxWidth: '340px', background: '#f5f3f0' }}>
    <Select
      label="Estado del paciente"
      options={[
        { value: 'activo',   label: 'Activo' },
        { value: 'inactivo', label: 'Inactivo' },
        { value: 'espera',   label: 'Lista de espera' },
      ]}
      error="Debes seleccionar un estado"
    />
  </div>
)
