/**
 * components/layout/TwoColumnLayout.tsx
 * Desktop rám #1b (#171): hlavní sloupec + boční panel jako slot.
 * Hlavní sloupec nese akce a stav, který po mně něco chce; boční panel jen lehký kontext
 * (nikdy akci, kterou nesmím minout). Na mobilu se sloupce skládají pod sebe, hlavní napřed.
 * Bez obsahu bočního panelu se panel nevykreslí a hlavní sloupec zabere celou šířku.
 */
import type { ReactNode } from 'react'

interface TwoColumnLayoutProps {
  /** Hlavní sloupec. */
  children: ReactNode
  /** Obsah bočního panelu; `null`/`undefined`/`false` = panel se nevykreslí. */
  aside?: ReactNode
  /** Přístupný název bočního panelu (landmark `complementary`). */
  asideLabel?: string
}

export function TwoColumnLayout({ children, aside, asideLabel = 'Boční panel' }: TwoColumnLayoutProps) {
  const hasAside = aside !== null && aside !== undefined && aside !== false
  return (
    <div className={hasAside ? 'two-column-layout two-column-layout--with-aside' : 'two-column-layout'} data-testid="two-column-layout">
      <div className="two-column-layout__main">{children}</div>
      {hasAside && (
        <aside className="two-column-layout__aside" aria-label={asideLabel}>
          {aside}
        </aside>
      )}
    </div>
  )
}
