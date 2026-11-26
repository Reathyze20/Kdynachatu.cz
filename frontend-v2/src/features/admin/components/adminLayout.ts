/**
 * Rozložení Správy a SuperAdminu pod hlavičkou stránky. `TwoColumnLayout` se nehodí: má sloupce s vlastním
 * scrollem na výšku okna, tady se posouvá celá stránka.
 */

/** Hlavní sloupec a boční sloupec karet vedle sebe od `lg`, pod ním pod sebou. */
export const ADMIN_LAYOUT_GRID_CLASS = 'grid items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.95fr)]'

/** Boční karty: na mobilu pod sebou, mezi `md` a `lg` ve dvou sloupcích, od `lg` v bočním sloupci pod sebou. */
export const ADMIN_SIDEBAR_STACK_CLASS = 'grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-1'

/** Hlavní sloupec s víc kartami pod sebou. */
export const ADMIN_PANEL_STACK_CLASS = 'flex min-w-0 flex-col gap-4 md:gap-6'
