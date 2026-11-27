/**
 * lib/offlineQueue.ts — Fronta mutací provedených bez připojení.
 *
 * Když POST/PUT/PATCH/DELETE selže kvůli výpadku sítě, uloží se do
 * LocalStorage a po obnovení připojení (event `online`) se v původním
 * pořadí přehraje přes apiClient. Fronta přežije i reload stránky.
 *
 * Neukládají se: GET požadavky, uploady souborů (FormData), auth
 * endpointy, nic s heslem nebo změnou účtu (#478) a klientské error reporty.
 *
 * Sdílené zařízení (#478): položka nese `userId` a `cabinId` autora. Přehrají se
 * jen položky přihlášeného uživatele v aktivní chatě, cizí se zahodí.
 *
 * Eventy na window:
 *   'offline-queue:changed' — změnil se počet čekajících mutací
 *   'offline-queue:flushed' — fronta byla (aspoň částečně) odeslána;
 *                             posluchač by měl invalidovat query cache
 */
import type { InternalAxiosRequestConfig } from 'axios'
import { formatCount, pluralize } from '@/lib/format'
import { isNetworkError } from '@/lib/networkError'
import { showToast } from '@/lib/toast'
import { getActiveCabinId, getStoredUserId } from '@/lib/authStorage'
import { SESSION_RESET_EVENT } from '@/lib/sessionReset'

interface QueueOwner {
  userId: string | null
  cabinId: string | null
}

export interface QueuedMutation extends QueueOwner {
  id: string
  method: string
  url: string
  data?: unknown
  queuedAt: string
}

const STORAGE_KEY = 'offlineMutationQueue'
const MAX_QUEUE_LENGTH = 100
/** Hlavička označující přehrávaný request — interceptor ho už znovu nefrontuje */
export const REPLAY_HEADER = 'X-Offline-Replay'

const QUEUEABLE_METHODS = new Set(['post', 'put', 'patch', 'delete'])
const EXCLUDED_URL_PARTS = [
  '/login',
  '/register',
  '/verify-token',
  '/forgot-password',
  '/reset-password',
  '/logs/client',
  '/staging-feedback', // tester má hned vidět, že se neuložilo, a text mu zůstane v poli
  '/users/me/password',
  '/users/me/logout-all',
  '/session-cookie',
  '/logout',
  '/waitlist', // návštěvník landing page má hned vidět, že se zápis neodeslal (#696)
]
/** Klíč těla s heslem: heslo nesmí skončit v plaintextu v LocalStorage (#478). */
const PASSWORD_KEY = /password/i

function currentOwner(): QueueOwner {
  return { userId: getStoredUserId(), cabinId: getActiveCabinId() }
}

function isOwnedBy(entry: QueuedMutation, owner: QueueOwner): boolean {
  return entry.userId === owner.userId && entry.cabinId === owner.cabinId
}

/** Axios v chybě vrací tělo už jako JSON řetězec. */
function parseBody(data: unknown): unknown {
  if (typeof data !== 'string') return data
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

/** Heslo, změna e-mailu nebo smazání účtu: bez připojení má request selhat, ne čekat. */
function isAccountSensitive(method: string, url: string, body: unknown): boolean {
  const keys = body && typeof body === 'object' ? Object.keys(body) : []
  if (keys.some((key) => PASSWORD_KEY.test(key))) return true
  const path = url.split('?')[0]
  return path === '/users/me' && (method === 'delete' || keys.includes('email'))
}

function readQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(queue: QueuedMutation[]): void {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
    }
  } catch {
    // LocalStorage plné/nedostupné — fronta se pro tuto změnu neuloží
  }
  window.dispatchEvent(new CustomEvent('offline-queue:changed'))
}

function readOwnQueue(): QueuedMutation[] {
  const owner = currentOwner()
  return readQueue().filter((entry) => isOwnedBy(entry, owner))
}

/** Počet změn přihlášeného uživatele v aktivní chatě, které čekají na odeslání. */
export function getQueueLength(): number {
  return readOwnQueue().length
}

/** Zahodí změny přihlášeného uživatele v aktivní chatě; cizí položky nechá (odhlášení, #537). */
export function discardOwnQueue(): void {
  const owner = currentOwner()
  writeQueue(readQueue().filter((entry) => !isOwnedBy(entry, owner)))
}

/** Čeká ve frontě request s touto metodou a URL? (štítek „Čeká na odeslání“, #276) */
export function isMutationQueued(method: string, url: string): boolean {
  const m = method.toLowerCase()
  return readOwnQueue().some((q) => q.method === m && q.url === url)
}

export function subscribeQueue(callback: () => void): () => void {
  window.addEventListener('offline-queue:changed', callback)
  return () => window.removeEventListener('offline-queue:changed', callback)
}

/** Chyba requestu, který api/client.ts bez signálu uložil do fronty (odešle se později). */
export function isQueuedOffline(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { queuedOffline?: boolean }).queuedOffline === true
}

/** Rozhodne, jestli daný request patří do offline fronty. */
export function isQueueableRequest(config: InternalAxiosRequestConfig | undefined): boolean {
  if (!config?.method || !config.url) return false
  if (!QUEUEABLE_METHODS.has(config.method.toLowerCase())) return false
  if (config.headers?.[REPLAY_HEADER]) return false
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) return false
  if (EXCLUDED_URL_PARTS.some((part) => config.url!.includes(part))) return false
  if (isAccountSensitive(config.method.toLowerCase(), config.url, parseBody(config.data))) return false
  return true
}

/** Uloží request do fronty. Vrací true při úspěchu. */
export function enqueueMutation(config: InternalAxiosRequestConfig): boolean {
  const queue = readQueue()
  if (queue.length >= MAX_QUEUE_LENGTH) return false

  queue.push({
    id: crypto.randomUUID(),
    method: config.method!.toLowerCase(),
    url: config.url!,
    data: parseBody(config.data),
    queuedAt: new Date().toISOString(),
    ...currentOwner(),
  })
  writeQueue(queue)
  return true
}

let flushing = false

/**
 * Přehraje frontu přihlášeného uživatele v pořadí vzniku. Při síťové chybě
 * se zastaví a čeká na další `online` event; při serverové chybě (4xx/5xx)
 * položku zahodí, aby neblokovala zbytek fronty. Položky jiného uživatele
 * nebo chaty zahodí, je-li někdo přihlášený; po vypršení session čekají na autora (#478).
 *
 * Vrací počet změn uživatele, pro kterého se flush spustil, které ve frontě zůstaly. Počítá se
 * podle vlastníka z doby spuštění: odpověď 401 mezitím smaže uloženou identitu (#537).
 */
export async function flushQueue(): Promise<number> {
  const owner = currentOwner()
  const remainingFor = () => readQueue().filter((entry) => isOwnedBy(entry, owner)).length
  if (flushing) return remainingFor()
  if (owner.userId !== null) {
    const queue = readQueue()
    const own = queue.filter((entry) => isOwnedBy(entry, owner))
    if (own.length !== queue.length) writeQueue(own)
  }
  if (remainingFor() === 0) return 0

  flushing = true
  // Lazy import — vyhne se cyklické závislosti client.ts ↔ offlineQueue.ts
  const { default: apiClient } = await import('@/api/client')

  let sent = 0
  let dropped = 0

  try {
    while (true) {
      const entry = readQueue().find((q) => isOwnedBy(q, owner))
      if (!entry) break

      try {
        await apiClient.request({
          method: entry.method,
          url: entry.url,
          data: entry.data,
          headers: { [REPLAY_HEADER]: '1' },
        })
        sent += 1
        writeQueue(readQueue().filter((q) => q.id !== entry.id))
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status
        if (isNetworkError(err) || status === 401) {
          // Spojení vypadlo, nebo vypršela session (#478) — položka počká na další pokus
          break
        }
        // Server request odmítl (např. konflikt, validace) — zahodit, jinak blokuje frontu
        dropped += 1
        writeQueue(readQueue().filter((q) => q.id !== entry.id))
      }
    }
  } finally {
    flushing = false
  }

  if (sent > 0) {
    window.dispatchEvent(new CustomEvent('offline-queue:flushed'))
    showToast(
      {
        title: 'Změny odeslány',
        detail: `${formatCount(sent, 'změna provedená', 'změny provedené', 'změn provedených')} offline ${pluralize(sent, 'byla uložena', 'byly uloženy', 'bylo uloženo')} na server.`,
      },
      'success',
    )
  }
  if (dropped > 0) {
    showToast(
      {
        title: 'Některé změny se nepodařilo uložit',
        detail: `${formatCount(dropped, 'změnu', 'změny', 'změn')} server odmítl — zkontroluj prosím data.`,
      },
      'error',
    )
  }
  return remainingFor()
}

/**
 * Zaregistruje flush na obnovení připojení a na začátek nové session,
 * zahodí položky z doby před vazbou na uživatele (bez `userId`, #478)
 * a zkusí flush při startu aplikace.
 */
export function initOfflineQueue(): void {
  const queue = readQueue()
  const owned = queue.filter((entry) => entry?.userId !== undefined)
  if (owned.length !== queue.length) writeQueue(owned)

  window.addEventListener('online', () => void flushQueue())
  window.addEventListener(SESSION_RESET_EVENT, () => void flushQueue())
  if (navigator.onLine) {
    void flushQueue()
  }
}
