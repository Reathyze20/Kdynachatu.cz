import { describe, expect, it } from 'vitest'
import { formatMessage } from '@/features/notes/formatMessage'
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
      + '<span class="msg-cb msg-cb-done">✓ <span>Zamčeno</span></span>'
      + '<span class="msg-cb msg-cb-todo">○ <span>Vypnutá voda</span></span>'
      + '</div>',
    )
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
