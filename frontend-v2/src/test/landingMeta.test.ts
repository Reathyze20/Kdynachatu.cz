import { describe, it, expect } from 'vitest'
// `?raw` deklaruje vite/client; vyhneme se tak node:fs (není v tsconfig.app typech).
import indexHtml from '../../index.html?raw'

/**
 * Náhled odkazu a výsledek vyhledávání (#698). Crawlery sociálních sítí nespouštějí JavaScript, takže titulek,
 * popis, Open Graph a Twitter card musí být staticky v `index.html` a obrázek náhledu musí ležet v `public/`.
 */

const SITE = 'https://kdynachatu.cz'
const CLAIM = 'Sdílená chata bez dohadování'
const SUBTITLE = 'Kdo kdy jede, v jakém stavu chatu nechal a co dochází. Na jednom místě, pro všechny rodiny, co se na chatě střídají.'
const MAX_OG_IMAGE_BYTES = 200 * 1024

const publicImages = import.meta.glob<string>('../../public/og-image.png', {
  query: '?inline',
  import: 'default',
  eager: true,
})

const head = new DOMParser().parseFromString(indexHtml, 'text/html').head

function meta(key: string): string | null | undefined {
  const el = head.querySelector(`meta[property="${key}"]`) ?? head.querySelector(`meta[name="${key}"]`)
  return el?.getAttribute('content')
}

function bytesOf(dataUrl: string): Uint8Array {
  return Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0))
}

/** Rozměry PNG z hlavičky IHDR (šířka a výška jsou big-endian na bajtech 16–23). */
function pngSize(bytes: Uint8Array): [number, number] {
  const view = new DataView(bytes.buffer)
  return [view.getUint32(16), view.getUint32(20)]
}

describe('landing page meta tags and link preview (#698)', () => {
  it('title and description carry the claim and the subtitle in Czech', () => {
    expect(head.querySelector('title')?.textContent).toBe(`${CLAIM} | Kdy na chatu`)
    expect(meta('description')).toBe(SUBTITLE)
  })

  it('has Open Graph tags for the root of the site', () => {
    expect(meta('og:title')).toBe(CLAIM)
    expect(meta('og:description')).toBe(SUBTITLE)
    expect(meta('og:type')).toBe('website')
    expect(meta('og:url')).toBe(`${SITE}/`)
    expect(meta('og:locale')).toBe('cs_CZ')
    expect(meta('og:site_name')).toBe('Kdy na chatu')
  })

  it('og:image is an absolute URL with declared size and alt text', () => {
    expect(meta('og:image')).toBe(`${SITE}/og-image.png`)
    expect(meta('og:image:width')).toBe('1200')
    expect(meta('og:image:height')).toBe('630')
    expect(meta('og:image:alt')).toBeTruthy()
  })

  it('has a large-image Twitter card with the same content', () => {
    expect(meta('twitter:card')).toBe('summary_large_image')
    expect(meta('twitter:title')).toBe(CLAIM)
    expect(meta('twitter:description')).toBe(SUBTITLE)
    expect(meta('twitter:image')).toBe(meta('og:image'))
  })

  it('the referenced image is a 1200 × 630 PNG in public/ under 200 kB', () => {
    const image = publicImages['../../public/og-image.png']
    expect(image, 'public/og-image.png chybí').toBeDefined()
    const bytes = bytesOf(image)
    expect(pngSize(bytes)).toEqual([1200, 630])
    expect(bytes.length).toBeLessThan(MAX_OG_IMAGE_BYTES)
  })
})
