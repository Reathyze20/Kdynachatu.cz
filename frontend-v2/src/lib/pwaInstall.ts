/**
 * lib/pwaInstall.ts — stav instalace PWA na plochu telefonu.
 *
 * Chrome/Edge/Samsung Internet (Android) vyšlou `beforeinstallprompt` jen jednou
 * a brzy po načtení — často dřív, než se namountuje AppShell. Proto se listener
 * registruje hned v main.tsx přes initPwaInstall() a událost si držíme tady.
 *
 * iOS Safari žádnou událost nemá: instalace jde jen ručně přes Sdílet →
 * „Přidat na plochu“, takže pro iOS jen vracíme `canInstall: 'ios'` a UI
 * ukáže návod.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallMode = 'prompt' | 'ios' | null

export interface PwaInstallState {
  /** Běží jako nainstalovaná aplikace (standalone okno). */
  isStandalone: boolean
  /** Jak lze instalovat: nativní dialog, návod pro iOS, nebo vůbec. */
  canInstall: InstallMode
}

const VISITS_KEY = 'pwa-install-visits'
const LAST_VISIT_KEY = 'pwa-install-last-visit-at'
const CARD_DISMISSED_KEY = 'pwa-install-card-dismissed'
/** Načtení do půl hodiny od posledního je pořád tatáž návštěva. */
const VISIT_GAP_MS = 30 * 60 * 1000
/** Na kolikáté návštěvě se poprvé nabídne karta instalace. */
const CARD_FROM_VISIT = 3

let deferredPrompt: BeforeInstallPromptEvent | null = null
let state: PwaInstallState = { isStandalone: false, canInstall: null }
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
}

export function detectIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  const isIos = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  if (!isIos) return false
  // Chrome/Firefox/Edge na iOS umí „Přidat na plochu“ až od iOS 16.4 a jinde v menu —
  // návod píšeme pro Safari, ostatní prohlížeče na iOS vynecháme.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent)
}

function recompute() {
  const isStandalone = detectStandalone()
  const canInstall: InstallMode = isStandalone
    ? null
    : deferredPrompt
      ? 'prompt'
      : detectIosSafari(navigator.userAgent, navigator.maxTouchPoints)
        ? 'ios'
        : null

  if (state.isStandalone !== isStandalone || state.canInstall !== canInstall) {
    state = { isStandalone, canInstall }
    emit()
  }
}

let initialized = false

export function initPwaInstall() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  window.addEventListener('beforeinstallprompt', (event) => {
    // Potlačí výchozí mini-infobar; nabídku ukážeme sami ve vhodnou chvíli
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    recompute()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    recompute()
  })

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', recompute)

  recordVisit()
  recompute()
}

export function subscribePwaInstall(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getPwaInstallState(): PwaInstallState {
  return state
}

/** Otevře nativní instalační dialog (jen Android/desktop Chromium). */
export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'
  const promptEvent = deferredPrompt
  // Událost lze použít jen jednou
  deferredPrompt = null
  await promptEvent.prompt()
  const { outcome } = await promptEvent.userChoice
  recompute()
  return outcome
}

function readNumber(key: string): number {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) ? value : 0
}

/** Započítá návštěvu v tomto zařízení; opakované načtení do půl hodiny se nepočítá. */
export function recordVisit(now = Date.now()) {
  const lastAt = readNumber(LAST_VISIT_KEY)
  if (!lastAt || now - lastAt >= VISIT_GAP_MS) {
    localStorage.setItem(VISITS_KEY, String(readNumber(VISITS_KEY) + 1))
  }
  localStorage.setItem(LAST_VISIT_KEY, String(now))
}

/** Karta instalace na Přehledu: od 3. návštěvy, dokud ji člověk neodmítne. */
export function shouldOfferInstallCard(): boolean {
  if (localStorage.getItem(CARD_DISMISSED_KEY)) return false
  return readNumber(VISITS_KEY) >= CARD_FROM_VISIT
}

/** „Teď ne“ — karta se už nikdy neukáže, instalovat jde dál z menu Víc. */
export function dismissInstallCard() {
  localStorage.setItem(CARD_DISMISSED_KEY, '1')
}
