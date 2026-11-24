/**
 * features/staging/testingTasks.ts
 * Úkoly karty „Co vyzkoušet“ (#388) a jejich odškrtnutí v prohlížeči (bez backendu, bez DB).
 * `id` úkolu je stabilní – zpětná vazba k úkolu (#389) se na něj bude odkazovat.
 */

export interface TestingTask {
  id: string
  title: string
  /** Cíl „Ukaž mi kde“ – cesta z routeru frontendu */
  to: string
}

export const TESTING_TASKS: readonly TestingTask[] = [
  { id: 'prehled', title: 'Rozhlédni se po přehledu – co na něm vidíš? Čemu nerozumíš? Co ti tam chybí?', to: '/dashboard' },
  { id: 'rezervace', title: 'Zarezervuj si víkend v kalendáři', to: '/reservations' },
  { id: 'nakup', title: 'Přidej něco do nákupního seznamu', to: '/shopping' },
  // Poznámka k měsíci je pod kalendářem na stránce rezervací
  { id: 'poznamka-mesic', title: 'Napiš poznámku k měsíci', to: '/reservations' },
  { id: 'chat', title: 'Pošli zprávu do chatu', to: '/notes' },
  // Stejný cíl jako záložka Předávka ve spodní liště (lib/navRoutes.ts)
  { id: 'predavka', title: 'Projdi předávku chaty', to: '/reservations?sekce=predavka' },
  { id: 'galerie', title: 'Prohlédni si galerii / deník', to: '/gallery' },
]

/** Klíč podle uživatele – na sdíleném zařízení si každý tester odškrtává sám */
export function checklistStorageKey(userId: string | null | undefined): string {
  return `co-vyzkouset:${userId ?? 'anon'}`
}

/** Odškrtnuté úkoly; neznámá id (úkol mezitím zmizel) se zahodí */
export function readDoneTasks(userId: string | null | undefined): string[] {
  try {
    const raw = localStorage.getItem(checklistStorageKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => TESTING_TASKS.some((t) => t.id === id))
  } catch {
    return []
  }
}

export function writeDoneTasks(userId: string | null | undefined, done: string[]): void {
  try {
    localStorage.setItem(checklistStorageKey(userId), JSON.stringify(done))
  } catch {
    // úložiště nedostupné – odškrtnutí jen nepřežije obnovení stránky
  }
}

export function allTasksDone(done: readonly string[]): boolean {
  return TESTING_TASKS.every((t) => done.includes(t.id))
}
