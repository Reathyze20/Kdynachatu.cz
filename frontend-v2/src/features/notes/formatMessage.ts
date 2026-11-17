/**
 * Převod textu zprávy na HTML pro bublinu chatu.
 *
 * Vstup MUSÍ být už escapovaný (escapeHtml) — tady se jen přidávají vlastní tagy.
 * Umí:
 *  - **tučně** (systémové zprávy z backendu, odjezdový protokol)
 *  - checklist `[x]` / `[ ]`, volitelně s odrážkou `- [x]` (DepartureBanner)
 */
const CHECK_RE = /^(?:[-*]\s+)?\[([ x])\]\s*(.*)$/i

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
        ? `<span class="msg-cb msg-cb-done">✓ <span>${formatInline(check[2])}</span></span>`
        : `<span class="msg-cb msg-cb-todo">○ <span>${formatInline(check[2])}</span></span>`
    }
    return line === ''
      ? `<span class="msg-spacer"></span>`
      : `<span class="msg-line">${formatInline(line)}</span>`
  })
  return `<div class="msg-protocol">${parts.join('')}</div>`
}
