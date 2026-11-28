/**
 * features/landing/NewLandingPage.tsx
 * Landing page na `/` pro nepřihlášené (#700, spec #692): lišta → hero se scénou chaty → screenshoty → funkce →
 * zakládající chata → oddíly a spolky → pronájem → od chataře → zápis do waitlistu → patička (#701). Stojí na
 * tokenech a sdílených komponentách (DESIGN.md), bez vlastního CSS. CTA z bloků spolky a pronájem předvyplní
 * formulář a doskočí na něj; odkaz s kotvou (`/#pronajem`) otevře stránku rovnou na sekci.
 */
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarDays, KeyRound, Menu, ShoppingBasket, UserRound, WifiOff, X, type LucideIcon } from 'lucide-react'
import type { DashboardReservationsData } from '@/api/dashboard'
import { Card } from '@/components/shared/Card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CabinScene } from '@/features/dashboard/CabinScene'
import dormouseNotebook from '@/features/dashboard/scene/dormouse-notebook.png'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/utils'
import { WaitlistForm, type WaitlistPrefill } from './WaitlistForm'

/** Návštěvník nemá chatu: scéna je prázdná chata s ročním obdobím z data zařízení, bez pobytů a bez počasí. */
const NO_STAYS: DashboardReservationsData = {
  activeReservation: null, upcomingReservations: [], myNextReservation: null, departingToday: false,
  nextFreeWeekend: null, lastStay: null, stats: { myNightsThisYear: 0, totalStaysThisMonth: 0 },
}

const CONTACT_EMAIL = 'ahoj@kdynachatu.cz'
const WRAP = 'mx-auto w-full max-w-5xl px-4 md:px-6'
/** Sekce pod lepkavou lištou: kotva nezajede pod ni. */
const SECTION = cn(WRAP, 'scroll-mt-20 py-8 md:py-12')
const TEXT_LINK = 'inline-flex min-h-(--touch-target-min) items-center rounded-(--radius-md) px-3 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring'

const NAV_LINKS = [
  { href: '#ukazka', label: 'Jak to vypadá' },
  { href: '#funkce', label: 'Funkce' },
]

/** Screenshoty fiktivní chaty Pod Lipou (#697), 390 × 844 px. */
const SCREENS = [
  {
    src: '/landing/kdy-kdo-jede.webp',
    title: 'Kdo kdy jede, vidí všichni.',
    text: 'Pobyty všech rodin v jednom kalendáři. Hned vidíš, kdy je chata volná.',
    alt: 'Kalendář pobytů na prosinec s barevnými pruhy pobytů jednotlivých rodin a volnými dny.',
  },
  {
    src: '/landing/predavka.webp',
    title: 'Víš, v jakém stavu najdeš chatu, ještě než vyjedeš.',
    text: 'Kdo odjíždí, předá chatu. Další rodina pak na Přehledu vidí, co po ní zůstalo: plyn, topení, voda a vzkaz.',
    alt: 'Přehled s kartou Na chatě teď: chata je volná, kdo jede příště a co po sobě nechali Novákovi.',
  },
  {
    src: '/landing/zasoby.webp',
    title: 'Co dochází, víš dřív, než to dojde.',
    text: 'Zásoby na chatě mají stav Dostatek, Dochází a Došlo. Co chybí, přidáš do společného nákupu.',
    alt: 'Zásoby na chatě: káva došla, toaletní papír a jar na nádobí docházejí.',
  },
]

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CalendarDays, title: 'Kdo kdy jede', text: 'Kalendář pobytů pro všechny rodiny. Volný víkend najdeš na první pohled.' },
  { icon: KeyRound, title: 'Předávka', text: 'Kdo odjíždí, zapíše plyn, topení, vodu, závady a vzkaz pro další rodinu.' },
  { icon: ShoppingBasket, title: 'Zásoby a nákupy', text: 'Co na chatě dochází, vidí všichni. Nakoupí ten, kdo jede.' },
  { icon: UserRound, title: 'Hosté', text: 'Půjčíš chatu kamarádovi a on uvidí jen svůj pobyt.' },
  {
    icon: WifiOff,
    title: 'Funguje bez signálu, výstupy do WhatsAppu',
    text: 'Co zapíšeš bez signálu, odešle se, až se chytí. Připomínky pošleš do rodinného WhatsAppu. WhatsApp nenahrazujeme, jen v něm přestaneš hledat.',
  },
]

function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="sticky top-0 z-(--z-header) border-b border-rule-soft bg-sheet">
      <nav data-testid="landing-nav" aria-label="Hlavní" className={cn(WRAP, 'flex min-h-16 items-center gap-2')}>
        <a href="#hero" className="mr-auto flex min-h-(--touch-target-min) items-center gap-2 rounded-(--radius-md) text-card-title">
          <img src="/logo-icon.svg" alt="" width={32} height={32} className="size-8" />
          Kdy na chatu
        </a>
        <div className="flex items-center gap-2 max-md:hidden">
          {NAV_LINKS.map((l) => <a key={l.href} href={l.href} className={cn(TEXT_LINK, 'text-label')}>{l.label}</a>)}
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/login">Přihlásit se</Link>
        </Button>
        <Button asChild size="sm" className="max-md:hidden">
          <a href="#zapis">Zapsat se</a>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={menuOpen ? 'Zavřít menu' : 'Otevřít menu'}
          aria-expanded={menuOpen}
          aria-controls="landing-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>
      </nav>
      {/* Jen mobil: odkazy na sekce a zápis. „Přihlásit se“ je v liště, v menu se neopakuje. */}
      <div id="landing-menu" data-testid="landing-mobile-menu" hidden={!menuOpen} className="border-t border-rule-soft md:hidden">
        <div className={cn(WRAP, 'flex flex-col gap-2 py-3')}>
          {NAV_LINKS.map((l) => <a key={l.href} href={l.href} className={TEXT_LINK} onClick={closeMenu}>{l.label}</a>)}
          <Button asChild className="w-full">
            <a href="#zapis" onClick={closeMenu}>Zapsat se</a>
          </Button>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section id="hero" aria-labelledby="landing-title" className={cn(SECTION, 'pt-4 md:pt-10')}>
      <Card className="flex flex-col gap-6 md:flex-row-reverse md:items-center md:gap-8">
        <div className="md:w-1/2">
          <CabinScene data={NO_STAYS} winterized={false} />
        </div>
        <div className="flex flex-col items-start gap-4 md:w-1/2">
          <h1 id="landing-title" className="text-page-title">Sdílená chata bez dohadování.</h1>
          <p className="text-body text-(--text-muted)">
            Kdo kdy jede, v jakém stavu chatu nechal a co dochází. Na jednom místě, pro všechny rodiny, co se na chatě střídají.
          </p>
          <Button asChild size="lg">
            <a href="#zapis">Zapsat se</a>
          </Button>
        </div>
      </Card>
    </section>
  )
}

function Screens() {
  return (
    <section id="ukazka" aria-labelledby="ukazka-title" className={SECTION}>
      <Card>
        <h2 id="ukazka-title" className="text-card-title">Takhle to vypadá v telefonu</h2>
        <p className="mt-1 text-body text-(--text-muted)">Ukázková chata Pod Lipou s vymyšlenými rodinami.</p>
        <ul className="mt-6 grid gap-8 md:grid-cols-3 md:gap-6">
          {SCREENS.map((s) => (
            <li key={s.src} className="flex flex-col gap-2">
              <h3 className="text-card-title">{s.title}</h3>
              <p className="text-body text-(--text-muted)">{s.text}</p>
              <img
                src={s.src}
                alt={s.alt}
                width={390}
                height={844}
                loading="lazy"
                decoding="async"
                className="mx-auto mt-2 h-auto w-full max-w-64 rounded-2xl border border-rule-soft shadow-lift"
              />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}

function Features() {
  return (
    <section id="funkce" aria-labelledby="funkce-title" className={SECTION}>
      <Card>
        <h2 id="funkce-title" className="text-card-title">Co na chatě vyřešíš</h2>
        <ul className="mt-6 grid gap-6 md:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-card-title">{title}</h3>
                <p className="mt-1 text-body text-(--text-muted)">{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 border-t border-rule-soft pt-4 text-label text-(--text-muted)">
          A k tomu galerie fotek, deník pobytů, chat a plánování rekonstrukce.
        </p>
      </Card>
    </section>
  )
}

function FoundingCabin() {
  return (
    <section id="zakladajici" aria-labelledby="zakladajici-title" className={SECTION}>
      <Card className="flex flex-col items-start gap-4">
        <h2 id="zakladajici-title" className="text-card-title">Zakládající chata</h2>
        <p className="text-body text-(--text-muted)">
          Prvních 50 chat má první sezónu zdarma a hlas při rozhodování, co se bude stavět dál. Cenu poznáš dřív, než
          budeš platit.
        </p>
        <Button asChild>
          <a href="#zapis">Zapsat se</a>
        </Button>
      </Card>
    </section>
  )
}

/** CTA bloku: doskočí na formulář a předá mu nový objekt `prefill` (WaitlistForm ho použije znovu). */
function PrefillCta({ label, prefill, onPrefill }: { label: string; prefill: WaitlistPrefill; onPrefill: (p: WaitlistPrefill) => void }) {
  return (
    <Button asChild variant="outline">
      <a href="#zapis" onClick={() => onPrefill({ ...prefill })}>{label}</a>
    </Button>
  )
}

function Clubs({ onPrefill }: { onPrefill: (p: WaitlistPrefill) => void }) {
  return (
    <section id="spolky" aria-labelledby="spolky-title" className={SECTION}>
      <Card className="flex flex-col items-start gap-4">
        <h2 id="spolky-title" className="text-card-title">Spravuješ chatu oddílu nebo spolku?</h2>
        <p className="text-body text-(--text-muted)">
          Na chatě se střídá víc lidí, klíče drží správce a závady se ztrácejí ve zprávách. I pro oddíl máš na jednom
          místě, kdo kdy jede, v jakém stavu kdo chatu předal a co dochází.
        </p>
        <PrefillCta label="Zapsat oddíl nebo spolek" prefill={{ segment: 'spolek' }} onPrefill={onPrefill} />
      </Card>
    </section>
  )
}

function Rental({ onPrefill }: { onPrefill: (p: WaitlistPrefill) => void }) {
  return (
    <section id="pronajem" aria-labelledby="pronajem-title" className={SECTION}>
      <Card className="flex flex-col items-start gap-4">
        <Badge variant="outline" className="border-rule-soft font-normal text-muted-foreground">Připravujeme</Badge>
        <h2 id="pronajem-title" className="text-card-title">Pronajímáš chatu i cizím lidem? Zvažujeme to.</h2>
        <p className="text-body text-(--text-muted)">
          Zatím to nestavíme. Zapiš se a dej nám vědět, co bys potřeboval. Až to bude, dozvíš se to první.
        </p>
        <PrefillCta label="Zapsat zájem o pronájem" prefill={{ rentalIntent: 'obcas' }} onPrefill={onPrefill} />
      </Card>
    </section>
  )
}

/** Jen křestní jméno, bez zdravotních údajů a bez fotky obličeje: místo ní plch z povolených obrázků (DESIGN.md §4). */
function Founder() {
  return (
    <section id="autor" aria-labelledby="autor-title" className={SECTION}>
      <Card className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <img src={dormouseNotebook} alt="" width={112} height={80} className="shrink-0 [image-rendering:pixelated]" />
        <div className="flex flex-col gap-3">
          <h2 id="autor-title" className="text-card-title">Od chataře</h2>
          <p className="text-body">
            Ahoj, jsem Tomáš. Kdy na chatu vznikla pro naši rodinnou chatu, na které se střídá několik rodin. Kdo kdy
            jede, jsme dohledávali ve WhatsAppu. Co dochází, jsme zjistili až na místě. A v jakém stavu chatu najdeme,
            nevěděl nikdo předem.
          </p>
          <p className="text-body">
            Tak jsem napsal aplikaci, kterou dnes používá celá naše rodina. Teď zkouším, jestli pomůže i dalším chatám.
          </p>
        </div>
      </Card>
    </section>
  )
}

export function NewLandingPage() {
  useDocumentTitle('Sdílená chata bez dohadování')
  const { hash } = useLocation()
  const [prefill, setPrefill] = useState<WaitlistPrefill | null>(null)

  // Odkaz s kotvou (`/#pronajem` pro pronajímatele) otevře stránku rovnou na sekci; prohlížeč to po vykreslení
  // Reactu sám neudělá.
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <div className="min-h-dvh text-(--text-main) [background:var(--bg-app-backdrop)]">
      <LandingNav />
      <main>
        <Hero />
        <Screens />
        <Features />
        <FoundingCabin />
        <Clubs onPrefill={setPrefill} />
        <Rental onPrefill={setPrefill} />
        <Founder />
        <section id="zapis" aria-labelledby="zapis-title" data-testid="landing-waitlist-section" className={SECTION}>
          {/* WaitlistForm je sám papírová karta, úvod je karta nad ním. */}
          <div className="mx-auto flex max-w-xl flex-col gap-4">
            <Card>
              <h2 id="zapis-title" className="text-card-title">Zapiš se na seznam</h2>
              <p className="mt-1 text-body text-(--text-muted)">
                Kdy na chatu zatím používá naše rodina. Zapiš se a ozvu se, až bude připravená i pro tvoji chatu.
              </p>
            </Card>
            <WaitlistForm prefill={prefill} />
          </div>
        </section>
      </main>
      <footer className="border-t border-rule-soft">
        <div className={cn(WRAP, 'flex flex-col gap-2 py-6 md:flex-row md:items-center md:justify-between')}>
          <p className="text-meta text-(--text-muted)">Kdy na chatu</p>
          <ul className="-mx-3 flex flex-wrap gap-2 text-label">
            <li><Link to="/privacy" className={TEXT_LINK}>Ochrana soukromí</Link></li>
            <li><a href={`mailto:${CONTACT_EMAIL}`} className={TEXT_LINK}>Kontakt</a></li>
            <li><Link to="/login" className={TEXT_LINK}>Přihlásit se</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  )
}
