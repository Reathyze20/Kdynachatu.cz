/**
 * components/shared/HelpFab.tsx
 * Překlad z #fab-help + #help-modal-overlay z index.html + initHelpSystem() z main.ts
 * Na mobilu plovoucí tlačítko nad dolní lištou; na desktopu (#205) položka „Nápověda“
 * dole v sidebaru (`variant="sidebar"`), aby tlačítko nepřekrývalo obsah ani nebylo oříznuté.
 * Která varianta je vidět, rozhoduje CSS podle šířky (help.css, nav.css).
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { CircleHelp } from 'lucide-react'
import { Modal } from './Modal'

// ─── Help obsah jako JSX ───────────────────────────────────────────────────────
const helpDictionary: Record<string, ReactNode> = {
  dashboard: (
    <>
      <h3>Přehled (Dashboard)</h3>
      <p>Tady najdeš souhrn aktuálního dění na chatě — nadcházející rezervace, počasí, rychlé statistiky a upozornění.</p>
      <ul>
        <li><strong>Widgety</strong> zobrazují nejdůležitější informace na jednom místě.</li>
        <li><strong>Odjezdový protokol</strong> — pokud dnes odjíždíš, nezapomeň vyplnit předávací formulář.</li>
        <li>Kliknutím na widget se přesuneš na příslušnou stránku.</li>
      </ul>
    </>
  ),
  reservations: (
    <>
      <h3>Rezervace</h3>
      <p>Správa pobytů na chatě. Můžeš si zarezervovat termín, spravovat stávající rezervace a sledovat dostupnost.</p>
      <ul>
        <li><strong>Kalendář</strong> — barevně odlišené rezervace. Kliknutím na den otevřeš detail.</li>
        <li><strong>Nová rezervace</strong> — vyber datum příjezdu a odjezdu, zadej účel návštěvy.</li>
        <li><strong>Editace</strong> — své rezervace můžeš upravit nebo smazat kliknutím na ně.</li>
        <li><strong>Dostupnost</strong> — přidej svou osobní dostupnost, aby ostatní věděli, kdy můžeš na chatu.</li>
      </ul>
    </>
  ),
  notes: (
    <>
      <h3>Chat</h3>
      <p>Rodinný chat — komunikuj s ostatními členy rodiny, sdílej informace a plánuj pobyt.</p>
      <ul>
        <li><strong>Vlákna</strong> — zprávy jsou organizovány do tematických vláken. Vyber téma v levém panelu.</li>
        <li><strong>Nové téma</strong> — klikni na „+" pro vytvoření nového vlákna.</li>
        <li><strong>Zprávy</strong> — zadej text a odešli. Podporujeme maximálně 2000 znaků na zprávu.</li>
      </ul>
    </>
  ),
  shopping: (
    <>
      <h3>Nákupy &amp; Zásoby</h3>
      <p>Spravuj nákupní seznamy a virtuální spíž. Víš vždy, co je na chatě a co je potřeba dokoupit.</p>
      <ul>
        <li><strong>Nákupní seznam</strong> — přidej položky, kliknutím na kolečko je odškrtni.</li>
        <li><strong>Virtuální spíž</strong> — sleduj, co je aktuálně na chatě.</li>
        <li><strong>Sdílení</strong> — seznamy automaticky vidí všichni členové rodiny.</li>
      </ul>
    </>
  ),
  gallery: (
    <>
      <h3>Galerie</h3>
      <p>Sdílená fotogalerie pro všechny pobyty.</p>
      <ul>
        <li><strong>Složky</strong> — fotky jsou organizovány do složek (např. podle pobytů).</li>
        <li><strong>Nahrávání</strong> — klikni na „+" ve složce pro přidání nových fotek.</li>
        <li><strong>Lightbox</strong> — klikni na fotku pro zobrazení v plné velikosti.</li>
      </ul>
    </>
  ),
  diary: (
    <>
      <h3>Deník</h3>
      <p>Zapisuj si zážitky z jednotlivých pobytů. Každý den má svou „stránku" v sešitě.</p>
      <ul>
        <li><strong>Pobyty</strong> — vytvoř nový pobyt a pak vyplňuj jednotlivé dny.</li>
        <li><strong>Fotky</strong> — ke každému dni můžeš připojit fotky z galerie.</li>
      </ul>
    </>
  ),
  reconstruction: (
    <>
      <h3>Rekonstrukce</h3>
      <p>Kanban nástěnka pro plánování a sledování úprav na chatě.</p>
      <ul>
        <li><strong>Nápady</strong> — inspirace, fotky, odhadovaná cena. Hlasuj pro prioritizaci.</li>
        <li><strong>Úkoly</strong> — konkrétní práce s termínem a rozpočtem.</li>
      </ul>
    </>
  ),
  admin: (
    <>
      <h3>Administrativa</h3>
      <p>Kompaktní administrace s horním menu pro členy, pozvánky a nastavení chaty. Pouze pro administrátory.</p>
      <ul>
        <li><strong>Členové a role</strong> — přehled účtů, oprávnění a lokálních přístupů.</li>
        <li><strong>Pozvánky</strong> — invite linky, e-mailové pozvánky a archiv starších vstupů.</li>
        <li><strong>Nastavení chaty</strong> — společná data, moduly, pravidla a odjezdový checklist.</li>
        <li><strong>Horní menu</strong> — rychlé přepnutí bez skrolování mezi hlavními částmi správy.</li>
      </ul>
    </>
  ),
  'admin/invites': (
    <>
      <h3>Pozvánky</h3>
      <p>Správa všech vstupů do chaty na jednom místě. Tady vytváříš nové odkazy, sdílíš je a uklízíš archiv.</p>
      <ul>
        <li><strong>Nová pozvánka</strong> — nastavíš roli, platnost a počet použití.</li>
        <li><strong>Text zprávy</strong> — jedním klikem zkopíruješ krátký text pro WhatsApp nebo SMS.</li>
        <li><strong>Archiv</strong> — staré nebo vyčerpané pozvánky zůstávají dole, aby nepřekážely aktivním vstupům.</li>
      </ul>
    </>
  ),
  'admin/cabin': (
    <>
      <h3>Nastavení chaty</h3>
      <p>Tahle část je teď součástí administrace chaty. Ovlivňuje všechny členy i moduly aplikace.</p>
      <ul>
        <li><strong>Základní údaje</strong> — název chaty, lokalita a další sdílené informace.</li>
        <li><strong>Zapnuté moduly</strong> — určují, které části aplikace budou v navigaci vidět.</li>
        <li><strong>Počasí a upozornění</strong> — ovlivňují dashboard a mrazové notifikace.</li>
        <li><strong>Napojené menu</strong> — ze správy se přepneš rovnou na členy, pozvánky nebo samostatnou diagnostiku.</li>
      </ul>
    </>
  ),
  'admin/diagnostics': (
    <>
      <h3>Diagnostika</h3>
      <p>Samostatná provozní stránka pro systémové logy, support kódy a rychlé dohledání incidentů.</p>
      <ul>
        <li><strong>Systémové logy</strong> — filtruj podle Request ID, textu, modulu nebo HTTP statusu.</li>
        <li><strong>Stav aplikace</strong> — rychlý snapshot počtu uživatelů, rezervací, fotek a zpráv.</li>
        <li><strong>Support workflow</strong> — panel připomíná, jak z chybového kódu najít konkrétní request.</li>
      </ul>
    </>
  ),
  'cabin-settings': (
    <>
      <h3>Nastavení chaty</h3>
      <p>Tahle část je teď součástí administrace chaty. Ovlivňuje všechny členy i moduly aplikace.</p>
      <ul>
        <li><strong>Základní údaje</strong> — název chaty, lokalita a další sdílené informace.</li>
        <li><strong>Zapnuté moduly</strong> — určují, které části aplikace budou v navigaci vidět.</li>
        <li><strong>Počasí a upozornění</strong> — ovlivňují dashboard a mrazové notifikace.</li>
        <li><strong>Napojené menu</strong> — ze správy se přepneš rovnou na členy, pozvánky nebo samostatnou diagnostiku.</li>
      </ul>
    </>
  ),
  default: (
    <>
      <h3>Nápověda</h3>
      <p>Vítej v aplikaci <strong>Kdy na chatu</strong> — rodinné aplikaci pro správu chaty.</p>
      <ul>
        <li><strong>Přehled</strong> — souhrn dění na chatě</li>
        <li><strong>Rezervace</strong> — správa pobytů</li>
        <li><strong>Chat</strong> — komunikace s rodinou</li>
        <li><strong>Nákupy</strong> — nákupní seznamy a spíž</li>
        <li><strong>Galerie</strong> — společné fotky</li>
        <li><strong>Deník</strong> — zápisky z pobytů</li>
        <li><strong>Rekonstrukce</strong> — plánování oprav</li>
      </ul>
    </>
  ),
}

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

  // help obsah dle aktuální routy
  const routeKey = location.pathname.replace(/^\//, '') || 'dashboard'
  const helpContent = helpDictionary[routeKey] ?? helpDictionary.default

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
