import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from '@/features/landing/LandingPage'

// #701: bloky zakládající chata, oddíly a spolky, pronájem a od chataře mezi funkcemi a formulářem.
// CTA z bloků předvyplní formulář waitlistu a doskočí na něj, `/#pronajem` otevře stránku na bloku o pronájmu.
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/api/client', () => ({ default: api, apiClient: api }))

const RENTAL_NEEDS = 'Co by ti nejvíc pomohlo (nepovinné)'
const RENTAL_INTENT = 'Pronajímáš (nebo chceš pronajímat) chatu cizím lidem (nepovinné)'

const renderLanding = (entry = '/') => render(<MemoryRouter initialEntries={[entry]}><LandingPage /></MemoryRouter>)
const section = (container: HTMLElement, id: string) => {
  const el = container.querySelector<HTMLElement>(`#${id}`)
  expect(el, id).not.toBeNull()
  return el as HTMLElement
}

const scrollIntoView = vi.fn()

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  // jsdom scrollIntoView nemá.
  Element.prototype.scrollIntoView = scrollIntoView
})
afterEach(() => {
  vi.unstubAllGlobals()
  scrollIntoView.mockReset()
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

describe('landing page: bloky mezi funkcemi a formulářem (#701)', () => {
  it('čtyři bloky jdou v pořadí funkce → zakládající chata → spolky → pronájem → od chataře → formulář', () => {
    const { container } = renderLanding()
    const order = ['funkce', 'zakladajici', 'spolky', 'pronajem', 'autor', 'zapis'].map((id) => section(container, id))
    order.slice(1).forEach((el, i) => {
      expect(order[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
    for (const el of order.slice(1, 5)) {
      const labelledBy = el.getAttribute('aria-labelledby')
      expect(labelledBy).toBeTruthy()
      expect(within(el).getByRole('heading', { level: 2 })).toHaveAttribute('id', labelledBy)
    }
  })

  it('zakládající chata: první sezóna zdarma, hlas při vývoji, cena předem a bez počítadla míst', () => {
    const { container } = renderLanding()
    const block = section(container, 'zakladajici')
    expect(block).toHaveTextContent(/Prvních 50 chat má první sezónu zdarma/)
    expect(block).toHaveTextContent(/hlas při rozhodování, co se bude stavět dál/)
    expect(block).toHaveTextContent(/Cenu poznáš dřív, než budeš platit\./)
    expect(block).not.toHaveTextContent(/zbýv|volných míst|zbývá/i)
  })

  it('CTA z bloku pro spolky předvyplní „Oddíl nebo spolek“ a doskočí na formulář', async () => {
    const user = userEvent.setup()
    const { container } = renderLanding()
    const block = section(container, 'spolky')
    expect(within(block).getByRole('heading', { level: 2 })).toHaveTextContent('Spravuješ chatu oddílu nebo spolku?')

    const cta = within(block).getByRole('link', { name: 'Zapsat oddíl nebo spolek' })
    expect(cta).toHaveAttribute('href', '#zapis')
    expect(screen.getByLabelText('Kdo jsi')).toHaveValue('')
    await user.click(cta)
    expect(screen.getByLabelText('Kdo jsi')).toHaveValue('spolek')
  })

  it('pronájem má kotvu, je označený „Připravujeme“ a nic neslibuje', () => {
    const { container } = renderLanding()
    const block = section(container, 'pronajem')
    expect(within(block).getByRole('heading', { level: 2 })).toHaveTextContent('Pronajímáš chatu i cizím lidem? Zvažujeme to.')
    expect(within(block).getByText('Připravujeme')).toBeInTheDocument()
    expect(block).toHaveTextContent('Zatím to nestavíme. Zapiš se a dej nám vědět, co bys potřeboval. Až to bude, dozvíš se to první.')
    expect(block).not.toHaveTextContent(/\d{4}|jaro|léto|podzim|zim[aě]|brzy|zdarma|zakládající|sezón/i)
  })

  it('CTA z bloku o pronájmu předvyplní „Občas“, ukáže „Co by ti nejvíc pomohlo“ a nechá vybraný segment', async () => {
    const user = userEvent.setup()
    const { container } = renderLanding()
    expect(screen.queryByRole('group', { name: RENTAL_NEEDS })).toBeNull()
    await user.selectOptions(screen.getByLabelText('Kdo jsi'), 'rodina')

    const cta = within(section(container, 'pronajem')).getByRole('link', { name: 'Zapsat zájem o pronájem' })
    expect(cta).toHaveAttribute('href', '#zapis')
    await user.click(cta)
    expect(screen.getByLabelText(RENTAL_INTENT)).toHaveValue('obcas')
    expect(screen.getByRole('group', { name: RENTAL_NEEDS })).toBeInTheDocument()
    expect(screen.getByLabelText('Kdo jsi')).toHaveValue('rodina')
  })

  it('odkaz /#pronajem otevře stránku na bloku o pronájmu', () => {
    const { container } = renderLanding('/#pronajem')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(section(container, 'pronajem'))
  })

  it('bez kotvy v adrese stránka nikam neskočí', () => {
    renderLanding()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('od chataře: jen křestní jméno, bez zdravotních údajů a místo fotky dekorativní plch', () => {
    const { container } = renderLanding()
    const block = section(container, 'autor')
    expect(block).toHaveTextContent(/Ahoj, jsem Tomáš\. Kdy na chatu vznikla pro naši rodinnou chatu/)
    // Za křestním jménem nesmí následovat příjmení (slovo s velkým písmenem).
    expect(block.textContent).not.toMatch(/Tomáš\s+\p{Lu}/u)
    expect(block).not.toHaveTextContent(/nemoc|zdravot|diagnóz|léčb|nemocnic/i)
    const images = block.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveAttribute('alt', '')
    expect(images[0].getAttribute('src')).toMatch(/dormouse/)
  })
})
