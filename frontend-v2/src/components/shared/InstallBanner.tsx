/**
 * InstallBanner.tsx — nabídka „Přidat aplikaci na plochu“ na mobilu.
 *
 * Android (Chromium): tlačítko otevře nativní instalační dialog.
 * iOS Safari: krátký návod Sdílet → „Přidat na plochu“ (jiná cesta neexistuje).
 * Zavřením se banner skryje na 30 dní; instalovat jde dál z profilu.
 * Plovoucí karta nad spodní navigací, aby nepřekrývala fixní mobilní hlavičku.
 */
import { useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { dismissInstallBanner, isInstallBannerDismissed, promptPwaInstall } from '@/lib/pwaInstall'

export function InstallBanner() {
  const { canInstall } = usePwaInstall()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [dismissed, setDismissed] = useState(() => isInstallBannerDismissed())

  if (!isMobile || dismissed || !canInstall) return null

  const handleDismiss = () => {
    dismissInstallBanner()
    setDismissed(true)
  }

  const handleInstall = async () => {
    const outcome = await promptPwaInstall()
    if (outcome === 'dismissed') handleDismiss()
  }

  return (
    <div
      role="region"
      aria-label="Instalace aplikace"
      data-testid="install-banner"
      className="fixed inset-x-3 flex items-start gap-3 rounded-xl border border-slate-200 bg-white shadow-md"
      // Padding inline: legacy `* { padding: 0 }` v base.css je mimo @layer a přebije Tailwind p-*.
      // Nad spodní navigací i nápovědou (.fab-help: bottom 80px + 48px); pod drawery a modaly.
      style={{ padding: 12, bottom: 'calc(136px + env(safe-area-inset-bottom, 0px))', zIndex: 'calc(var(--z-drawer) - 50)' }}
    >
      <img src="/pwa-icon-192.png" alt="" width={40} height={40} className="shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-sm">
        <p className="font-semibold text-slate-900">Mějte chatu po ruce</p>
        {canInstall === 'prompt' ? (
          <>
            <p className="text-slate-600">Nainstalujte si aplikaci na plochu — otevře se bez prohlížeče a funguje i offline.</p>
            <button type="button" className="button-primary inline-flex items-center gap-1.5" style={{ marginTop: 4 }} onClick={handleInstall}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Nainstalovat
            </button>
          </>
        ) : (
          <p className="text-slate-600">
            Klepněte na <Share className="inline h-4 w-4 align-text-bottom" aria-label="Sdílet" /> a zvolte
            {' '}<strong>„Přidat na plochu“</strong>.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Zavřít nabídku instalace"
        className="shrink-0 rounded-lg text-slate-400 hover:text-slate-600"
        style={{ padding: 4, margin: -4 }}
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}
