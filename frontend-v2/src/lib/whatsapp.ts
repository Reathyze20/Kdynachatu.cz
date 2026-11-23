/**
 * Most do rodinné skupiny, dokud nepřijde bot (fáze 3): zpráva + odkaz do aplikace.
 * Kopíruje se přes `CopyForWhatsAppButton` (#264).
 */
export function whatsAppMessage(message: string, href: string): string {
  return `${message}\n${window.location.origin}${href}`;
}
