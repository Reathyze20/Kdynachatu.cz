/**
 * Převod textu zprávy na HTML pro bublinu chatu.
 *
 * Vstup MUSÍ být už escapovaný (escapeHtml) — tady se jen přidávají vlastní tagy.
 * Umí:
 *  - **tučně** (systémové zprávy z backendu, odjezdový protokol)
 *  - checklist `[x]` / `[ ]`, volitelně s odrážkou `- [x]` (DepartureBanner)
 */
const CHECK_RE = /^(?:[-*]\s+)?\[([ x])\]\s*(.*)$/i

/** Lucide `check` / `circle` jako inline SVG — výstup je HTML string, ne React (#165). */
const svgIcon = (body: string) =>
  '<svg class="msg-cb-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"'
  + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
  + ` aria-hidden="true">${body}</svg>`
export const CHECK_DONE_ICON = svgIcon('<path d="M20 6 9 17l-5-5"/>')
export const CHECK_TODO_ICON = svgIcon('<circle cx="12" cy="12" r="10"/>')

function formatInline(line: string): string {
  return line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

export function formatMessage(escaped: string): string {
  const lines = escaped
    .split('\n')
    .map((line) => line.replace(/^\|\s*/, ''))

  const hasChecks = lines.some((l) => CHECK_RE.test(l))
  if (!hasChecks) return lines.map(formatInline).join('<br>')

  // Koncový \n z protokolu nemá dělat mezeru navíc
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()

  const parts = lines.map((line) => {
    const check = line.match(CHECK_RE)
    if (check) {
      const done = check[1].toLowerCase() === 'x'
      return done
        ? `<span class="msg-cb msg-cb-done">${CHECK_DONE_ICON}<span>${formatInline(check[2])}</span></span>`
        : `<span class="msg-cb msg-cb-todo">${CHECK_TODO_ICON}<span>${formatInline(check[2])}</span></span>`
    }
    return line === ''
      ? `<span class="msg-spacer"></span>`
      : `<span class="msg-line">${formatInline(line)}</span>`
  })
  return `<div class="msg-protocol">${parts.join('')}</div>`
}
