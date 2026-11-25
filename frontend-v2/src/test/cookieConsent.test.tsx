import { describe, it, expect, beforeEach, onTestFinished, vi } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CookieConsent } from '@/components/shared/CookieConsent'
import { PrivacyPage } from '@/features/legal/PrivacyPage'

/** Lišta o cookies (#516): jedna věta, odkaz do Ochrany soukromí, nezakrývá spodní navigaci. */

const renderBanner = () => render(<MemoryRouter><CookieConsent /></MemoryRouter>)
const findBanner = () => screen.findByTestId('cookie-consent-banner', {}, { timeout: 2000 })

describe('Lišta o cookies (#516)', () => {
  beforeEach(() => localStorage.clear())

  it('text je jedna věta s odkazem na sekci cookies v Ochraně soukromí', async () => {
    renderBanner()
    const text = await screen.findByTestId('cookie-consent-text', {}, { timeout: 2000 })

    const sentence = text.textContent?.trim() ?? ''
    expect(sentence.match(/[.!?…]/g)).toEqual(['.'])
    expect(sentence.endsWith('.')).toBe(true)

    const link = screen.getByRole('link', { name: 'Ochraně soukromí' })
    expect(text).toContainElement(link)
    expect(link).toHaveAttribute('href', '/privacy#cookies')
  })

  it('nezmiňuje vzhled ani tmavý režim, nemá vtip ani rozbalovací podrobnosti', async () => {
    renderBanner()
    const banner = await findBanner()
    expect(banner.textContent).not.toMatch(/vzhled|tmav|světl|režim|sušen|jídl/i)
    expect(screen.queryByTestId('cookie-consent-detail-toggle')).not.toBeInTheDocument()
  })

  it('„Rozumím“ lištu zavře a příště se už neukáže', async () => {
    const { unmount } = renderBanner()
    await findBanner()
    fireEvent.click(screen.getByRole('button', { name: 'Rozumím' }))
    expect(screen.queryByTestId('cookie-consent-banner')).not.toBeInTheDocument()
    unmount()

    vi.useFakeTimers()
    onTestFinished(() => { vi.useRealTimers() })
    renderBanner()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByTestId('cookie-consent-banner')).not.toBeInTheDocument()
  })

  it('odkaz z lišty otevře Ochranu soukromí rovnou na sekci cookies', async () => {
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id) }
    onTestFinished(() => { Element.prototype.scrollIntoView = original })
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<CookieConsent />} />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('link', { name: 'Ochraně soukromí' }, { timeout: 2000 }))
    expect(await screen.findByTestId('privacy-page')).toBeInTheDocument()
    expect(scrolled).toEqual(['cookies'])
  })

  // jsdom neumí layout ani Tailwind, proto hlídáme kontrakt třídy: když je na stránce spodní
  // mobilní lišta, sedí oznámení nad ní (výška z nav.css včetně bezpečné zóny), jinak u spodního okraje.
  it('se spodní navigací sedí nad ní, bez ní u spodního okraje', async () => {
    renderBanner()
    const banner = await findBanner()
    expect(banner).toHaveClass('fixed', 'bottom-0')
    expect(banner.className).toContain(
      'in-[body:has(.mobile-nav)]:bottom-[calc(var(--mobile-nav-height,0px)+env(safe-area-inset-bottom,0px))]',
    )
  })
})
