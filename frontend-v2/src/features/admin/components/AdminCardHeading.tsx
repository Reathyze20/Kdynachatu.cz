import type { ReactNode } from 'react'

interface AdminCardHeadingProps {
  /** Krátký štítek nad nadpisem (eyebrow). */
  eyebrow: string
  title: string
  description?: ReactNode
  /** Počet vedle nadpisu („3/12“). */
  counter?: ReactNode
}

/** Hlavička karty ve správě a backoffice na typové škále DESIGN.md §3: eyebrow, nadpis karty `h2`, popisek. */
export function AdminCardHeading({ eyebrow, title, description, counter }: AdminCardHeadingProps) {
  return (
    <div className="mb-4 grid gap-1">
      <span className="text-eyebrow uppercase text-(--text-muted)">{eyebrow}</span>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-card-title text-(--text-main)">{title}</h2>
        {counter !== undefined && <span className="rounded-full bg-accent px-2 text-meta text-primary">{counter}</span>}
      </div>
      {description && <p className="text-label text-(--text-muted)">{description}</p>}
    </div>
  )
}
