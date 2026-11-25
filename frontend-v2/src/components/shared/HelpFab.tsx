/**
 * components/shared/HelpFab.tsx
 * Překlad z #fab-help + #help-modal-overlay z index.html + initHelpSystem() z main.ts
 * Na mobilu plovoucí tlačítko nad dolní lištou; na desktopu (#205) položka „Nápověda“
 * dole v sidebaru (`variant="sidebar"`), aby tlačítko nepřekrývalo obsah ani nebylo oříznuté.
 * Která varianta je vidět, rozhoduje CSS podle šířky (help.css, nav.css).
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CircleHelp } from 'lucide-react'
import { Modal } from './Modal'
import { helpForLocation } from './helpContent'

interface HelpFabProps {
  /** `fab` = plovoucí tlačítko (mobil), `sidebar` = položka v desktopovém sidebaru. */
  variant?: 'fab' | 'sidebar'
}

export function HelpFab({ variant = 'fab' }: HelpFabProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const lastScrollY = useRef(0)
  const location = useLocation()

  // Při scrollu dolů se FAB schová, aby nepřekrýval obsah a tlačítka;
  // při scrollu nahoru (nebo na vršku stránky) se zase objeví.
  useEffect(() => {
    if (variant !== 'fab') return
    function handleScroll() {
      const y = window.scrollY
      if (y <= 8) {
        setHidden(false)
      } else if (Math.abs(y - lastScrollY.current) > 12) {
        setHidden(y > lastScrollY.current)
      }
      lastScrollY.current = y
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [variant])

  const helpContent = helpForLocation(location)

  return (
    <>
      {variant === 'sidebar' ? (
        <button
          type="button"
          className="app-sidebar-link app-sidebar-help"
          title="Nápověda k této stránce"
          onClick={() => setIsOpen(true)}
          data-testid="desktop-help-button"
        >
          <CircleHelp size={20} aria-hidden="true" />
          <span className="app-sidebar-label">Nápověda</span>
        </button>
      ) : (
        <button
          id="fab-help"
          className={`fab-help${hidden ? ' fab-help--hidden' : ''}`}
          title="Potřebuješ poradit?"
          aria-label="Potřebuješ poradit?"
          onClick={() => setIsOpen(true)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <path d="M12 17h.01"></path>
          </svg>
        </button>
      )}

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Nápověda k této stránce"
        maxWidth="max-w-xl"
      >
        <div id="help-modal-content" className="help-modal-body">
          {helpContent}
        </div>
      </Modal>
    </>
  )
}
