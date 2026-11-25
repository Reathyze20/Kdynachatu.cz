/**
 * XSS vektory přes escapeHtml a formatMessage (#481).
 *
 * Výstup obou funkcí jde do dangerouslySetInnerHTML (bublina chatu, poznámky
 * rezervace, kanban). Test výstup opravdu naparsuje jako HTML a hledá cokoli
 * spustitelného: nečekaný tag, on* atribut, URL atribut nebo text, který by
 * se po parsování změnil v jiný obsah, než uživatel napsal.
 */
import { describe, expect, it } from 'vitest'
import { formatMessage } from '@/features/notes/formatMessage'
import { escapeHtml } from '@/lib/utils'

const VECTORS: Array<[string, string]> = [
  ['script tag', '<script>alert(1)</script>'],
  ['script tag s velkými písmeny', '<ScRiPt>alert(1)</sCrIpT>'],
  ['img onerror', '<img src=x onerror=alert(1)>'],
  ['svg onload', '<svg onload=alert(1)>'],
  ['iframe javascript:', '<iframe src="javascript:alert(1)"></iframe>'],
  ['odkaz javascript:', '<a href="javascript:alert(1)">klikni</a>'],
  ['javascript: jako holý text', 'javascript:alert(document.cookie)'],
  ['únik z atributu dvojitou uvozovkou', '" onmouseover="alert(1)'],
  ['únik z atributu jednoduchou uvozovkou', "' onfocus='alert(1)' autofocus='"],
  ['zavření tagu a nový element', '"><img src=x onerror=alert(1)>'],
  ['HTML entity místo závorek', '&lt;script&gt;alert(1)&lt;/script&gt;'],
  ['číselné entity', '&#60;img src=x onerror=alert(1)&#62;'],
  ['hex entity v javascript:', '<a href="&#x6A;avascript:alert(1)">x</a>'],
  ['neukončený komentář', '<!--<img src=x onerror=alert(1)>-->'],
  ['CDATA', '<![CDATA[<script>alert(1)</script>]]>'],
  ['style s expression', '<div style="background:url(javascript:alert(1))">x</div>'],
  ['fullwidth závorky', '＜script＞alert(1)＜/script＞'],
  ['zero-width znaky v tagu', '<scr\u200bipt>alert(1)</scr\u200bipt>'],
  ['RTL override', '\u202e<img src=x onerror=alert(1)>'],
  ['null bajt', '<img\u0000 src=x onerror=alert(1)>'],
  ['nový řádek uvnitř tagu', '<img\nsrc=x\nonerror=alert(1)>'],
  ['XSS uvnitř **tučně**', '**<img src=x onerror=alert(1)>**'],
  ['XSS přes hranici **tučně**', '**<scr**ipt>alert(1)</script>'],
  ['XSS v položce checklistu', '- [x] <img src=x onerror=alert(1)>'],
  ['XSS v protokolu s tučným nadpisem', '**<svg onload=alert(1)>**\n- [ ] "><script>alert(1)</script>'],
  ['XSS za prefixem citace', '| <img src=x onerror=alert(1)>'],
]

/** Tagy, které formatMessage smí vytvořit (vlastní značky + lucide SVG ikony). */
const ALLOWED_TAGS = new Set(['div', 'span', 'br', 'strong', 'svg', 'path', 'circle'])
const ALLOWED_ATTRS = new Set([
  'class', 'xmlns', 'width', 'height', 'viewbox', 'fill', 'stroke', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'aria-hidden', 'd', 'cx', 'cy', 'r',
])

const withoutNull = (s: string) => s.replaceAll(String.fromCharCode(0), '')

function parse(html: string): HTMLTemplateElement {
  const template = document.createElement('template')
  template.innerHTML = html
  return template
}

function executableParts(html: string): string[] {
  const found: string[] = []
  for (const el of parse(html).content.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) found.push(`<${tag}>`)
    for (const attr of el.attributes) {
      if (!ALLOWED_ATTRS.has(attr.name.toLowerCase())) found.push(`${tag}[${attr.name}]`)
    }
  }
  return found
}

describe('escapeHtml – XSS vektory (#481)', () => {
  it.each(VECTORS)('%s: výstup je jen text, který se zobrazí přesně jak byl napsán', (_name, raw) => {
    const html = escapeHtml(raw)
    const template = parse(html)

    expect(template.content.querySelectorAll('*')).toHaveLength(0)
    // HTML parser v textu zahazuje \u0000, jinak se text nesmí změnit
    expect(template.content.textContent).toBe(withoutNull(raw))
  })

  it.each(VECTORS)('%s: výstup je bezpečný i uvnitř atributu v uvozovkách', (_name, raw) => {
    const html = `<span title="${escapeHtml(raw)}" data-x='${escapeHtml(raw)}'></span>`
    const spans = parse(html).content.querySelectorAll('*')

    expect(spans).toHaveLength(1)
    expect([...spans[0].attributes].map((a) => a.name)).toEqual(['title', 'data-x'])
  })
})

describe('formatMessage(escapeHtml(...)) – XSS vektory (#481)', () => {
  it.each(VECTORS)('%s: výstup neobsahuje spustitelné HTML', (_name, raw) => {
    expect(executableParts(formatMessage(escapeHtml(raw)))).toEqual([])
  })

  it.each(VECTORS)('%s: text útočníka zůstane v bublině vidět jako text', (_name, raw) => {
    const text = parse(formatMessage(escapeHtml(raw))).content.textContent ?? ''
    const visible = withoutNull(raw).replace(/\*\*/g, '').replace(/^\| ?/gm, '')

    // Checklist zahodí svou značku `- [x] `, zbytek textu musí zůstat celý
    for (const line of visible.split('\n').map((l) => l.replace(/^(?:[-*]\s+)?\[[ x]\]\s*/i, ''))) {
      expect(text).toContain(line)
    }
  })

  it('kontrola testu: neescapovaný vstup by test opravdu chytil', () => {
    expect(executableParts(formatMessage('<img src=x onerror=alert(1)>'))).toEqual(['<img>', 'img[src]', 'img[onerror]'])
  })
})
