import type { ReactNode } from 'react'

interface AdminCardHeadingProps {
  /** Krátký štítek nad nadpisem (eyebrow). */
  eyebrow: string
  title: string
  description?: ReactNode
  /** Krátký počet vedle nadpisu („2 aktivní“). */
  meta?: string
  /** `id` nadpisu pro `aria-labelledby` sekce. */
  titleId?: string
}

/** Hlavička karty ve správě a backoffice na typové škále DESIGN.md §3: eyebrow, nadpis karty `h2`, popisek. */
export function AdminCardHeading({ eyebrow, title, description, meta, titleId }: AdminCardHeadingProps) {
  return (
    <div className="mb-4 grid gap-1">
      <span className="text-eyebrow uppercase text-(--text-muted)">{eyebrow}</span>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id={titleId} className="text-card-title text-(--text-main)">{title}</h2>
        {meta && <span className="text-meta text-(--text-muted)">{meta}</span>}
      </div>
      {description && <p className="text-label text-(--text-muted)">{description}</p>}
    </div>
  )
}
