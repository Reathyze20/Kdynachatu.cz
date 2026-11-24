/**
 * features/staging/testingTasks.ts
 * Úkoly karty „Co vyzkoušet“ (#388) a jejich odškrtnutí v prohlížeči (bez backendu, bez DB).
 * `id` úkolu je stabilní – zpětná vazba k úkolu (#389) se na něj odkazuje (backend id ověřuje).
 */
import type { StagingFeedbackTaskId } from '@/api/stagingFeedback'

/** Cíl „Ukaž mi kde“ – cesta z routeru frontendu; `name` rozliší víc cílů jednoho úkolu */
export interface TaskPlace {
  to: string
  name?: string
}

export interface TestingTask {
  id: Exclude<StagingFeedbackTaskId, 'general'>
  title: string
  places: readonly TaskPlace[]
}

/** Popisek obecného pole (`taskId: 'general'`) – karta i výpis ve Správě (#390) */
export const GENERAL_FEEDBACK_LABEL = 'Cokoli dalšího'

export const TESTING_TASKS: readonly TestingTask[] = [
  { id: 'prehled', title: 'Rozhlédni se po přehledu – co na něm vidíš? Čemu nerozumíš? Co ti tam chybí?', places: [{ to: '/dashboard' }] },
  { id: 'rezervace', title: 'Zarezervuj si víkend v kalendáři', places: [{ to: '/reservations' }] },
  { id: 'nakup', title: 'Přidej něco do nákupního seznamu', places: [{ to: '/shopping' }] },
  // Poznámka k měsíci je pod kalendářem na stránce rezervací
  { id: 'poznamka-mesic', title: 'Napiš poznámku k měsíci', places: [{ to: '/reservations' }] },
  { id: 'chat', title: 'Pošli zprávu do chatu', places: [{ to: '/notes' }] },
  // Stejný cíl jako záložka Předávka ve spodní liště (lib/navRoutes.ts)
  { id: 'predavka', title: 'Projdi předávku chaty', places: [{ to: '/reservations?sekce=predavka' }] },
  { id: 'galerie', title: 'Prohlédni si galerii / deník', places: [{ to: '/gallery', name: 'galerie' }, { to: '/diary', name: 'deník' }] },
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
