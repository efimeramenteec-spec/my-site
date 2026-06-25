import React from 'react'
import { Card } from '../components/Card/Card.jsx'
import { Badge } from '../components/Badge/Badge.jsx'

/** On-brand "coming soon" surface for pages not yet built. */
export function Placeholder({ icon: Icon, title, description, eta }) {
  return (
    <Card withOrbs className="mt-4 px-8 py-16 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-card bg-brand-gradient text-white shadow-glow">
        {Icon ? <Icon size={30} /> : null}
      </div>
      <h2 className="font-serif text-2xl font-bold text-content-primary">{title}</h2>
      <p className="mx-auto mt-2 max-w-md font-body text-content-secondary">{description}</p>
      {eta && (
        <div className="mt-5">
          <Badge variant="lavender">{eta}</Badge>
        </div>
      )}
    </Card>
  )
}
