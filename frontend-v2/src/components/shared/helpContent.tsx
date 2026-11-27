/** Texty nápovědy (#510). Klíč = cíl položky navigace (Kalendář a Předávka sdílejí stránku), mimo navigaci cesta.
 *  Názvy obrazovek a tlačítek musí sedět s UI; hlas textů podle DESIGN.md §8. */
import type { ReactNode } from 'react'
import { findActiveNavItem, MORE_NAV, PRIMARY_NAV } from '@/lib/navRoutes'

export const HELP_PAGES: Record<string, ReactNode> = {
  '/dashboard': (
    <>
      <h3>Přehled</h3>
      <p>Na jednom místě vidíš, co se na chatě děje teď a co čeká na tebe.</p>
      <ul>
        <li><strong>Na chatě teď</strong> – kdo je zrovna na chatě, nebo kdy je další pobyt. U pobytu je i předpověď počasí.</li>
        <li><strong>Visí na tobě</strong> – věci, které můžeš udělat jen ty: v den odjezdu předávka chaty, když jedeš příště, plyn a došlé nezbytné zásoby. Tlačítko tě vezme rovnou k úkolu.</li>
        <li><strong>Důležité</strong> – výstraha před bouřkou, plyn a závada z poslední předávky chaty, došlé nezbytné zásoby a čerstvý vzkaz. „Koupím já“ dá ostatním vědět, že to přivezeš.</li>
        <li><strong>Vzkaz</strong> – připnutá zpráva pro každého, kdo na chatu přijede.</li>
      </ul>
    </>
  ),
  '/reservations': (
    <>
      <h3>Kalendář</h3>
      <p>Kdo kdy jede na chatu. Pobyty jsou barevně v kalendáři, jejich seznam je vedle (na mobilu pod kalendářem).</p>
      <ul>
        <li><strong>Výběr dne</strong> – klepni na den a seznam ukáže jen pobyty, které ten den zasahují.</li>
        <li><strong>Nový pobyt</strong> – na vybraný den klepni ještě jednou (příjezd) a pak na den odjezdu. Pak vybereš, jestli chatu rezervuješ, nebo jen dáš vědět, že máš dovolenou (host rovnou rezervuje). Jde to i tlačítkem „Nová rezervace“.</li>
        <li><strong>Typ rezervace</strong> – ve formuláři vybereš pevnou, nebo předběžnou. Když se termín kryje s jinou rezervací, uloží se tvoje jako záložní.</li>
        <li><strong>Detail pobytu</strong> – klepni na pobyt v kalendáři nebo v seznamu. Svůj pobyt tu upravíš nebo smažeš.</li>
        <li><strong>Hlídat</strong> – u cizího pobytu: až se termín uvolní, objeví se to na nástěnce chaty.</li>
      </ul>
    </>
  ),
  '/reservations?sekce=predavka': (
    <>
      <h3>Předávka chaty</h3>
      <p>Předávka chaty je krátký zápis o tom, v jakém stavu chatu necháváš. Kdo přijede po tobě, uvidí ho jako přivítání a ví, co ho čeká.</p>
      <ul>
        <li><strong>Kdy</strong> – během pobytu, nejlíp těsně před odjezdem. Nejpozději den po odjezdu.</li>
        <li><strong>V den odjezdu</strong> – na Přehledu ti ji „Visí na tobě“ připomene. Tlačítko otevře tvůj pobyt, kde ji vyplníš.</li>
        <li><strong>Kdykoli jindy</strong> – v Kalendáři otevři svůj pobyt, dole najdeš „Stav chaty při odjezdu“. Jde to jen u pevné rezervace.</li>
        <li><strong>Co vyplnit</strong> – plynovou bombu, jestli je vypnuté topení a uzavřená voda, co je rozbité, co na chatě zůstalo (dřevo, jídlo…) a vzkaz pro dalšího. Všechno je nepovinné. Nakonec klepni na „Potvrdit odjezd“.</li>
        <li><strong>Bez signálu</strong> – předávka chaty počká v telefonu a odešle se, jakmile budeš online.</li>
      </ul>
    </>
  ),
  '/shopping': (
    <>
      <h3>Zásoby</h3>
      <p>Co je na chatě a co je potřeba dovézt. Nahoře přepínáš mezi Zásobami a Nákupem, číslo u Nákupu říká, kolik věcí zbývá koupit.</p>
      <ul>
        <li><strong>Nákup</strong> – vyber seznam a přidej položky. Klepnutím na položku ji označíš jako koupenou.</li>
        <li><strong>Přivezu z domova</strong> – ikona domečku dá ostatním vědět, že věc vezeš ty. Hvězdička ji označí jako důležitou.</li>
        <li><strong>Zásoby</strong> – u každé věci vidíš, jestli je jí dostatek, dochází, nebo došla. Co chybí, přidáš do nákupu jedním klepnutím, nebo všechno najednou přes „Vše do nákupu“.</li>
      </ul>
    </>
  ),
  '/notes': (
    <>
      <h3>Chat</h3>
      <p>Rodinný chat rozdělený do témat, ať se nákup nemíchá s opravami.</p>
      <ul>
        <li><strong>Témata</strong> – vyber téma ze seznamu, nebo založ nové tlačítkem „Nové téma“. Téma najdeš i vyhledáváním.</li>
        <li><strong>Zpráva</strong> – napiš text a odešli. Jedna zpráva má nejvýš 2&nbsp;000 znaků.</li>
        <li><strong>Co se zprávou</strong> – podrž na ní prst (na počítači klikni pravým tlačítkem). Můžeš odpovědět, zkopírovat text, přidat věc do nákupu nebo z ní udělat úkol do Rekonstrukce. Svou zprávu můžeš smazat, upravit jen do 15 minut po odeslání.</li>
      </ul>
    </>
  ),
  '/gallery': (
    <>
      <h3>Galerie</h3>
      <p>Společné fotky z chaty, rozdělené do alb.</p>
      <ul>
        <li><strong>Alba</strong> – nové založíš tlačítkem „Nové album“. Alba můžeš hledat a řadit od nejnovějších.</li>
        <li><strong>Nahrávání</strong> – otevři album a klepni na „Nahrát“.</li>
        <li><strong>Prohlížení</strong> – klepni na fotku a ukáže se přes celou obrazovku. Odtud ji stáhneš nebo k ní připíšeš vzpomínku.</li>
      </ul>
    </>
  ),
  '/diary': (
    <>
      <h3>Deník</h3>
      <p>Zápisky z pobytů na chatě. Každý pobyt má svůj zápisník a každý den v něm svou stránku.</p>
      <ul>
        <li><strong>Nový pobyt</strong> – založ pobyt. Termín si můžeš načíst z rezervace.</li>
        <li><strong>Zápis</strong> – otevři pobyt, klepni na den a napiš, co se dělo.</li>
        <li><strong>Fotky</strong> – ke dni připojíš fotky z Galerie.</li>
      </ul>
    </>
  ),
  '/reconstruction': (
    <>
      <h3>Rekonstrukce</h3>
      <p>Plány úprav na chatě ve třech sloupcích. Kartu přesuneš do jiného sloupce tažením.</p>
      <ul>
        <li><strong>Nápady</strong> – inspirace s odkazem, obrázkem a odhadovanou cenou. Tlačítkem „Chci to“ dáš nápadu hlas, nápady s nejvíc hlasy jsou nahoře.</li>
        <li><strong>Firmy</strong> – kontakty na řemeslníky a jestli jste je už oslovili.</li>
        <li><strong>Úkoly</strong> – konkrétní práce s termínem a cenou.</li>
      </ul>
    </>
  ),
  '/admin': (
    <>
      <h3>Správa</h3>
      <p>Nastavení chaty a členů pro správce. Na mobilu ji otevřeš z menu Víc, na počítači z profilového menu. Mezi částmi přepínáš nahoře.</p>
      <ul>
        <li><strong>Členové a role</strong> – kdo má do chaty přístup a s jakou rolí (admin, člen, host). Tady přidáš i člena bez e-mailu.</li>
        <li><strong>Pozvánky</strong> – odkazy, přes které se k chatě přidají noví lidé.</li>
        <li><strong>Nastavení chaty</strong> – údaje chaty, pravidla, odjezdový checklist a zapnuté části aplikace.</li>
        <li><strong>Diagnostika</strong> – záznamy aplikace pro hledání chyb.</li>
      </ul>
    </>
  ),
  '/admin/invites': (
    <>
      <h3>Pozvánky</h3>
      <p>Tady zveš nové lidi do chaty a uklízíš staré pozvánky.</p>
      <ul>
        <li><strong>Nová pozvánka</strong> – vyber roli, na kolik dní platí a kolikrát jde použít. Pak klepni na „Vytvořit pozvánku“.</li>
        <li><strong>Sdílení</strong> – „Zkopírovat pro WhatsApp“ připraví zprávu s odkazem. Pozvánku jde poslat i e-mailem.</li>
        <li><strong>Archiv</strong> – vypršelé a vyčerpané pozvánky jsou dole v archivu, aby nepřekážely.</li>
      </ul>
    </>
  ),
  '/admin/cabin': (
    <>
      <h3>Nastavení chaty</h3>
      <p>Nastavení chaty je součástí administrace chaty a změny platí pro všechny členy.</p>
      <ul>
        <li><strong>Titulní fotka a základní informace</strong> – jak se chata jmenuje a kde je.</li>
        <li><strong>Uvítání a pravidla</strong> – uvítací zpráva a pravidla chaty.</li>
        <li><strong>Odjezdový checklist</strong> – co zkontrolovat před uzamčením chaty.</li>
        <li><strong>Zazimování</strong> – zimní režim s mrazovými výstrahami.</li>
        <li><strong>Aktivní moduly</strong> – které části aplikace (třeba Galerie nebo Deník) se ukážou v navigaci.</li>
      </ul>
    </>
  ),
  '/admin/diagnostics': (
    <>
      <h3>Diagnostika</h3>
      <p>Samostatná provozní stránka pro administrátory. Když někdo z rodiny nahlásí chybu, tady zjistíš, co se stalo.</p>
      <ul>
        <li><strong>Kód chyby</strong> – chybová obrazovka ukáže kód. Popros o něj a vyhledej ho v logu.</li>
        <li><strong>Systémové logy</strong> – záznamy aplikace. Filtruješ podle dne, závažnosti, zdroje (server, nebo aplikace) a textu.</li>
        <li><strong>Stav aplikace</strong> – kolik je v chatě uživatelů, rezervací, fotek a zpráv.</li>
      </ul>
    </>
  ),
  default: (
    <>
      <h3>Nápověda</h3>
      <p><strong>Kdy na chatu</strong> je rodinná aplikace pro společnou chatu. Nápověda se mění podle toho, kde v aplikaci jsi.</p>
      <ul>
        <li><strong>Přehled</strong> – co se na chatě děje teď</li>
        <li><strong>Kalendář</strong> – kdo kdy jede</li>
        <li><strong>Předávka chaty</strong> – stav chaty při odjezdu</li>
        <li><strong>Zásoby</strong> – nákupy a co je na chatě</li>
        <li><strong>Chat</strong> – zprávy podle témat</li>
        <li><strong>Galerie</strong> – společné fotky</li>
        <li><strong>Deník</strong> – zápisky z pobytů</li>
        <li><strong>Rekonstrukce</strong> – plány úprav</li>
      </ul>
    </>
  ),
}

/** Nápověda podle aktivní položky navigace; stránky mimo navigaci podle cesty, jinak obecná. */
export function helpForLocation(location: { pathname: string; search: string }): ReactNode {
  const navItem = findActiveNavItem([...PRIMARY_NAV, ...MORE_NAV], location)
  return HELP_PAGES[navItem?.to ?? location.pathname] ?? HELP_PAGES.default
}
