/**
 * Klíče localStorage po odstraněných funkcích. Smažou se při startu aplikace,
 * aby stará uložená hodnota nepřebíjela současný vzhled.
 */
const LEGACY_KEYS = [
  // Vlastní pozadí ze zrušeného zen módu (#248); od C5a (#245) nemá kam patřit.
  'app-background',
  // Odklad plovoucího instalačního banneru o 30 dní; banner nahradila karta po 3. návštěvě (#277).
  'pwa-install-dismissed-at',
] as const

export function clearLegacyStorage(): void {
  for (const key of LEGACY_KEYS) localStorage.removeItem(key)
}
