/**
 * components/layout/AppBackdrop.tsx
 * Titulní fotka chaty jako pozadí appky po přihlášení (D4, #341, picker 08 varianta A):
 * ostrá fotka přes celé okno pevně za obsahem a teplý závoj. Ukáže se až po načtení a jen
 * když má velikost pozadí; do té doby, bez fotky nebo při chybě zůstane podklad D z body.
 */
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useCabinSettings } from '@/features/settings/hooks/useCabinSettings'

/** Delší strana varianty pozadí (#340: 1920 × 1200, mobilní 1080 × 1920). Pruhy z 1.8.0 mají 1000 a 750. */
const BACKDROP_MIN_SIDE = 1500

/**
 * Stránky, kde je všechen text na kartách a papírových plochách, takže fotka smí být vidět.
 * Ostatní mají nadpisy, záložky nebo prázdné stavy přímo na pozadí: tam zatím podklad D (#341).
 */
const PHOTO_PAGES = ['/dashboard', '/reservations']

/** Mobilní varianta má stejné jméno s příponou `-sm` (#340); cesta mimo dohodnutý tvar jde bez ní. */
function mobileCoverUrl(url: string): string | null {
  return url.endsWith('.webp') ? `${url.slice(0, -'.webp'.length)}-sm.webp` : null
}

export function AppBackdrop() {
  // Změnu fotky správcem přinese realtime invalidace ['cabin'] (useRealtimeSync)
  const { data: cabin } = useCabinSettings()
  const { pathname } = useLocation()
  const url = cabin?.coverPhotoUrl
  if (!url) return null
  // Nová fotka = nový obrázek: stav načtení se nepřenáší z předchozí
  return <CoverBackdrop key={url} url={url} hidden={!PHOTO_PAGES.includes(pathname)} />
}

interface CoverBackdropProps {
  url: string
  /** Stránka má text mimo karty: fotka zůstane načtená, ale schovaná. */
  hidden: boolean
}

function CoverBackdrop({ url, hidden }: CoverBackdropProps) {
  const [ready, setReady] = useState(false)
  const small = mobileCoverUrl(url)

  return (
    <div className="app-backdrop" data-testid="app-backdrop" data-visible={ready && !hidden} aria-hidden="true">
      <picture>
        {small ? <source media="(max-width: 768px)" srcSet={small} /> : null}
        <img
          src={url}
          alt=""
          decoding="async"
          fetchPriority="low"
          onLoad={(e) => setReady(Math.max(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight) >= BACKDROP_MIN_SIDE)}
          onError={() => setReady(false)}
        />
      </picture>
      <div className="app-backdrop__veil" />
    </div>
  )
}
