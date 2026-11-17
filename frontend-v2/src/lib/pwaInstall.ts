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

const DISMISS_KEY = 'pwa-install-dismissed-at'
const DISMISS_DAYS = 30

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

export function isInstallBannerDismissed(now = Date.now()): boolean {
  const raw = localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  const dismissedAt = Number(raw)
  if (!Number.isFinite(dismissedAt)) return false
  return now - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000
}

export function dismissInstallBanner(now = Date.now()) {
  localStorage.setItem(DISMISS_KEY, String(now))
}
