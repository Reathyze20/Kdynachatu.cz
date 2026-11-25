/**
 * CookieConsent.tsx — jednovětá informace o cookies (#516).
 * Používáme jen technicky nezbytné cookies, takže souhlas nesbíráme, jen informujeme.
 * Podrobnosti jsou v sekci cookies v Ochraně soukromí.
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

const CONSENT_KEY = 'cookieConsent'

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const accepted = localStorage.getItem(CONSENT_KEY)
    if (!accepted) {
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  function handleAccept() {
    localStorage.setItem(CONSENT_KEY, 'true')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <section
      aria-label="Cookies"
      data-testid="cookie-consent-banner"
      // Se spodní mobilní lištou (AppShell) sedí nad ní, ať ji nezakrývá; --mobile-nav-height je jen na mobilu (nav.css).
      className="fixed inset-x-0 bottom-0 z-(--z-toast) border-t border-rule-soft bg-sheet px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] shadow-lift in-[body:has(.mobile-nav)]:bottom-[calc(var(--mobile-nav-height,0px)+env(safe-area-inset-bottom,0px))] in-[body:has(.mobile-nav)]:pb-2"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <p className="m-0 flex-1 text-body text-(--text-main)" data-testid="cookie-consent-text">
          Používáme jen technicky nezbytné cookies, podrobnosti najdeš v{' '}
          <Link to="/privacy#cookies" className="font-semibold text-primary underline underline-offset-2">
            Ochraně soukromí
          </Link>
          .
        </p>
        <Button size="sm" onClick={handleAccept} data-testid="cookie-consent-accept-button">
          Rozumím
        </Button>
      </div>
    </section>
  )
}
