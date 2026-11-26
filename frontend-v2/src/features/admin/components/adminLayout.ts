/**
 * Rozložení Správy a SuperAdminu pod hlavičkou stránky. `TwoColumnLayout` se nehodí: má sloupce s vlastním
 * scrollem na výšku okna, tady se posouvá celá stránka.
 */

/** Hlavní sloupec a boční sloupec karet vedle sebe od `lg`, pod ním pod sebou. */
export const ADMIN_LAYOUT_GRID_CLASS = 'grid items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.95fr)]'

/** Sloupec s víc kartami pod sebou (hlavní i boční). Boční je pod `lg` pod hlavním sloupcem. */
export const ADMIN_COLUMN_STACK_CLASS = 'flex min-w-0 flex-col gap-4 md:gap-6'
