/**
 * Rozložení Správy a SuperAdminu pod hlavičkou stránky. `TwoColumnLayout` se nehodí: má sloupce s vlastním
 * scrollem na výšku okna, tady se posouvá celá stránka.
 */

/** Hlavní sloupec a boční sloupec karet vedle sebe od `lg`, pod ním pod sebou. */
export const ADMIN_LAYOUT_GRID_CLASS = 'grid items-start gap-4 md:gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.95fr)]'

/** Sloupec s víc kartami pod sebou (hlavní i boční). Boční je pod `lg` pod hlavním sloupcem. */
export const ADMIN_COLUMN_STACK_CLASS = 'flex min-w-0 flex-col gap-4 md:gap-6'

/** Stránka Správy, Diagnostiky a SuperAdminu: posouvá se celá, karty pod sebou s mezerou podle DESIGN.md. */
export const ADMIN_PAGE_CLASS = 'flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-3 md:gap-6 md:p-6'

/** Krátký formulář v kartě: pole pod sebou, `.form-group` z forms.css bez vlastního spodního okraje. */
export const ADMIN_FORM_CLASS = 'grid gap-4 [&_.form-group]:mb-0!'
