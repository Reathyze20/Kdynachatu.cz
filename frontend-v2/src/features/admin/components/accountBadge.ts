/**
 * Štítek role a stavu účtu ve Správě i SuperAdminu (#527, dřív admin.css): typografie eyebrow, barvy z rolí
 * DESIGN.md §2. Stav nese barvu z --ok / --low / --empty, role je tichá na --inset, vlastní účet a superadmin
 * jsou zvýrazněná plocha. Text má na podbarvení ≥ 4,5 : 1.
 */
const TONES = {
  quiet: 'bg-inset text-(--text-muted)',
  role: 'bg-inset text-(--text-main)',
  brand: 'bg-accent text-primary',
  ok: 'bg-(--ok-bg) text-[rgb(var(--ok))]',
  low: 'bg-(--low-bg) text-[rgb(var(--low))]',
  empty: 'bg-(--empty-bg) text-[rgb(var(--empty))]',
} as const

export type AccountBadgeTone = keyof typeof TONES

export const accountBadgeClass = (tone: AccountBadgeTone) =>
  `inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-1 text-eyebrow uppercase ${TONES[tone]}`

/** Role Admin inkoustem, Člen a Host tichým textem. */
export const roleBadgeTone = (role: string): AccountBadgeTone => (role === 'admin' ? 'role' : 'quiet')
