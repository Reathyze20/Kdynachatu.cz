import { describe, expect, it } from 'vitest'
import { CHECK_DONE_ICON, CHECK_TODO_ICON, formatMessage } from '@/features/notes/formatMessage'
import { escapeHtml } from '@/lib/utils'

const render = (raw: string) => formatMessage(escapeHtml(raw))

describe('formatMessage', () => {
  it('obyčejný text zalomí přes <br>', () => {
    expect(render('Ahoj\nJak je?')).toBe('Ahoj<br>Jak je?')
  })

  it('**tučně** ze systémových zpráv vykreslí jako <strong>', () => {
    expect(render('**AdminUser** přidal/a rezervaci')).toBe('<strong>AdminUser</strong> přidal/a rezervaci')
  })

  it('odjezdový protokol s odrážkami „- [x]“ vykreslí jako checklist', () => {
    const html = render('**Odjezd z chaty:**\n- [x] Zamčeno\n- [ ] Vypnutá voda\n')
    expect(html).toBe(
      '<div class="msg-protocol">'
      + '<span class="msg-line"><strong>Odjezd z chaty:</strong></span>'
      + `<span class="msg-cb msg-cb-done">${CHECK_DONE_ICON}<span>Zamčeno</span></span>`
      + `<span class="msg-cb msg-cb-todo">${CHECK_TODO_ICON}<span>Vypnutá voda</span></span>`
      + '</div>',
    )
  })

  it('stav položky checklistu nese lucide SVG ikona skrytá před čtečkou, ne znak', () => {
    expect(CHECK_DONE_ICON).toMatch(/^<svg [^>]*aria-hidden="true"[^>]*>.*<\/svg>$/)
    expect(CHECK_DONE_ICON).toContain('<path d="M20 6 9 17l-5-5"/>')
    expect(CHECK_TODO_ICON).toMatch(/^<svg [^>]*aria-hidden="true"[^>]*>.*<\/svg>$/)
    expect(CHECK_TODO_ICON).toContain('<circle cx="12" cy="12" r="10"/>')
    expect(render('- [x] A\n- [ ] B')).not.toMatch(/[✓○]/)
  })

  it('checklist bez odrážky (MessageInput) funguje dál', () => {
    expect(render('[x] Hotovo')).toContain('msg-cb-done')
  })

  it('HTML ve zprávě zůstane escapované i uvnitř tučného textu', () => {
    const html = render('**<img src=x onerror=alert(1)>**')
    expect(html).toBe('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>')
    expect(html).not.toContain('<img')
  })

  it('osamocené hvězdičky nechá být', () => {
    expect(render('2 * 3 = 6')).toBe('2 * 3 = 6')
  })
})
