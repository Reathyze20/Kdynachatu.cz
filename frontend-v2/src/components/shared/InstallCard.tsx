/**
 * InstallCard.tsx — nabídka „Přidat na plochu“ (#277, mock 06 díl 7 B).
 *
 * InstallCard: karta v toku stránky na konci Přehledu, poprvé na 3. návštěvě; jen mobil (od md skrytá).
 * „Teď ne“ ji skryje natrvalo. Nic nepřekrývá (pravidlo E3).
 * InstallMenuItem: trvalá položka v menu Víc.
 * Android (Chromium) otevře nativní instalační dialog, iOS Safari ukáže návod Sdílet → „Přidat na plochu“.
 * V nainstalované appce se nevykreslí ani jedno.
 */
import { useId, useState } from 'react'
import { Download, Share } from 'lucide-react'
import { Card } from '@/components/shared/Card'
import { Button } from '@/components/ui/button'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { dismissInstallCard, promptPwaInstall, shouldOfferInstallCard } from '@/lib/pwaInstall'

function IosInstallHint() {
  return (
    <p className="m-0 text-meta text-(--text-muted)">
      Klepni na <Share className="inline size-4 align-text-bottom" aria-label="Sdílet" /> a zvol
      {' '}<strong>„Přidat na plochu“</strong>.
    </p>
  )
}

/** Na Androidu spustí instalaci, na iOS přepne návod. Vrací, jestli se má návod ukázat. */
function useInstallAction() {
  const { canInstall } = usePwaInstall()
  const [showIosHint, setShowIosHint] = useState(false)
  const install = async () => {
    if (canInstall === 'ios') {
      setShowIosHint((shown) => !shown)
      return 'ios' as const
    }
    return promptPwaInstall()
  }
  return { canInstall, showIosHint: canInstall === 'ios' && showIosHint, install }
}

export function InstallCard() {
  const headingId = useId()
  const { canInstall, showIosHint, install } = useInstallAction()
  const [offered, setOffered] = useState(() => shouldOfferInstallCard())

  if (!offered || !canInstall) return null

  const handleDismiss = () => {
    dismissInstallCard()
    setOffered(false)
  }

  const handleInstall = async () => {
    // Odmítnutí v nativním dialogu platí jako „Teď ne“; instalovat jde dál z menu Víc.
    if ((await install()) === 'dismissed') handleDismiss()
  }

  return (
    <Card as="section" className="mx-3 mb-3 flex flex-col gap-2 md:hidden" aria-labelledby={headingId} data-testid="install-card">
      <h2 id={headingId} className="m-0 text-card-title text-(--text-main)">Otevíráš chatu často?</h2>
      <p className="m-0 text-meta text-(--text-muted)">Přidej si ji na plochu, otevře se jako aplikace.</p>
      {showIosHint && <IosInstallHint />}
      <div className="mt-1 flex gap-2">
        <Button type="button" className="flex-1" onClick={() => void handleInstall()}>Přidat</Button>
        <Button type="button" variant="secondary" onClick={handleDismiss}>Teď ne</Button>
      </div>
    </Card>
  )
}

export function InstallMenuItem({ className, labelClassName }: { className: string; labelClassName?: string }) {
  const { canInstall, showIosHint, install } = useInstallAction()
  if (!canInstall) return null

  return (
    <>
      <button type="button" className={className} aria-expanded={canInstall === 'ios' ? showIosHint : undefined} onClick={() => void install()}>
        <Download size={20} aria-hidden="true" />
        <span className={labelClassName}>Přidat na plochu</span>
      </button>
      {showIosHint && <IosInstallHint />}
    </>
  )
}
