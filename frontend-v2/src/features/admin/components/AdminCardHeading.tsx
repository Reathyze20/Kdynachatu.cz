import type { ReactNode } from 'react'

interface AdminCardHeadingProps {
  /** Krátký štítek nad nadpisem (eyebrow). */
  eyebrow: string
  title: string
  description?: ReactNode
}

/** Hlavička karty ve správě a backoffice na typové škále DESIGN.md §3: eyebrow, nadpis karty `h2`, popisek. */
export function AdminCardHeading({ eyebrow, title, description }: AdminCardHeadingProps) {
  return (
    <div className="mb-4 grid gap-1">
      <span className="text-eyebrow uppercase text-(--text-muted)">{eyebrow}</span>
      <h2 className="text-card-title text-(--text-main)">{title}</h2>
      {description && <p className="text-label text-(--text-muted)">{description}</p>}
    </div>
  )
}
