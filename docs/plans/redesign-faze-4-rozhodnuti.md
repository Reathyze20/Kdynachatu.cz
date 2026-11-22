# Redesign – Fáze 4: Log rozhodnutí a stav (návrhy obrazovek)

Stav k **2026-11-21**. Tenhle soubor je **kotva proti /clear**: drží, co je rozhodnuté, kde to
leží a jak pokračovat. Navazuje na [pravidla Fáze 4](redesign-faze-4-pravidla.md) a
[rozsah Fáze 3](redesign-faze-3-rozsah.md).

## Jak navázat po /clear (agent čti první)

1. Přečti tenhle soubor celý + [pravidla Fáze 4](redesign-faze-4-pravidla.md). Stav ber odtud, ne z paměti.
2. V tabulce „Pořadí návrhů" najdi první řádek se stavem 🟡 (návrh dodán, čeká na volbu) nebo ⬜ (ještě není).
3. **Má-li uživatel v další zprávě vloženou „volbu dílů"** (export z pickeru) → zapiš ji jako nové
   rozhodnutí (odrážky + „Odsouhlaseno \<datum\>"), přepni řádek v tabulce na ✅ a **postav další návrh**
   v pořadí. Prázdné díly = postav doporučenou variantu A.
4. **Nemá-li vloženou volbu** → návrh na řadě je už hotový HTML soubor; řekni uživateli, ať ho otevře
   dvojklikem, vybere a pošle export. Nic nestav znovu.
5. **Jak stavět nový návrh:** zkopíruj mechaniku z posledního hotového souboru v `docs/design/`
   (`02-predavka` / `03-prijezd` mají phone + desktop rám). Od #2 dál **dvojrámečkově** (mobil + desktop,
   rám zamčený: sidebar + dva sloupce + čitelná šířka). Drž pravidla A–H, pravidlo „co patří na
   dashboard", bez emoji (jen Lucide). Před kreslením obrazovky, kterou neznáš z hlavy, si její
   dnešní stav ověř v kódu (subagent), ať návrh stojí na realitě.
6. Po dodání návrhu vždy aktualizuj tabulku + přidej rozpis dílů sem do logu.

**Věta, kterou uživatel napíše po /clear:** „Pokračujeme redesign Fáze 4. Přečti
`docs/plans/redesign-faze-4-rozhodnuti.md` a pokračuj." — a pokud má výsledky, rovnou pod to vloží
export z pickeru.

## Kde to stojí

- Fáze 1 (vize) ✅ · Fáze 2 (katalog) ✅ · Fáze 3 (rozsah) ✅ · Fáze 4 (design) ✅ · **Fáze 5 (stavba) běží** → rozpad na tickety viz [redesign-faze-5-rozpad.md](redesign-faze-5-rozpad.md).
- Pravidla FE/UX odsouhlasena → [redesign-faze-4-pravidla.md](redesign-faze-4-pravidla.md)
  (A–H, pevné volby C4a zmírnit sklo · C5a lehké pozadí · H1a umírněná osobnost chaty).
- **Formát návrhů = „Akcion picker".** Samostatné single-file HTML v `docs/design/`, jedna
  obrazovka = jeden soubor `NN-<obrazovka>-atomy.html`. Uvnitř díly, každý díl 2–3 varianty
  A/B/C vedle sebe (A = nejjednodušší + doporučená), vestavěný picker „Tuhle chci" s
  localStorage, export volby textem, přepínač světlé/tmavé. Otevírá se dvojklikem, nic se
  nebuilduje. Identita: Moderní Les (emerald/slate), Plus Jakarta Sans, **Lucide ikony**.
  Šablonová mechanika je ověřená v souboru #0 — pro další obrazovky se kopíruje.

## Pořadí návrhů (V1 rozsah, klín napřed)

| # | Soubor | Stav |
|---|---|---|
| 0 | `docs/design/00-navigace-atomy.html` — mapa appky + navigace | ✅ hotovo a odsouhlaseno |
| 1 | `docs/design/01-prehled-atomy.html` — Přehled „stav chaty teď" | ✅ odsouhlaseno (všech 5 dílů = A) |
| 1b | `docs/design/01b-desktop-ram-atomy.html` — desktop rám (globální) | ✅ odsouhlaseno (všechny 3 díly = A) |
| 2 | `docs/design/02-predavka-atomy.html` — Předávka (D1), těžiště | ✅ odsouhlaseno (všech 5 dílů = A) |
| 3 | `docs/design/03-prijezd-atomy.html` — Příjezdová karta (B1) | ✅ odsouhlaseno (všech 5 dílů = A) |
| 4 | `docs/design/04-rezervace-atomy.html` — Rezervace + kalendář + řetězec (A1/A2) | ✅ odsouhlaseno (všech 5 dílů = A) |
| 5 | `docs/design/05-zasoby-atomy.html` — Zásoby / nákupy (C1) | ✅ odsouhlaseno (všech 5 dílů = A) · **V1 rozsah hotov** |
| 6 | `docs/design/06-prehled-v2-atomy.html` — Přehled v2 podle průzkumu + vizuální detaily (13 dílů) | ✅ odsouhlaseno 2026-11-22 (vše A, kromě: pozornost A+C, instalace B), upřesnění 1 a 2 potvrzena |

## Rozhodnutí #0 — navigace a mapa appky (odsouhlaseno)

- **Hlavní navigace → A: podle cyklu turnusu** — dolní lišta Přehled · Kalendář · Předávka · Zásoby · Víc.
- **Role Přehledu → A: „stav chaty teď"** — kdo je na chatě, co visí na mně, co dochází, další příjezd.
- **Doplňky → A: všechno pod „Víc"** — galerie, deník, rekonstrukce, chat jako sekundární sekce; jádro se nerozmělňuje.
- **Jazyk sekcí → A: podle věcí** — Přehled, Kalendář, Předávka, Zásoby (ne fáze cyklu).

## Návrh #1 — Přehled „stav chaty teď" (čeká na volbu)

Detail první obrazovky; role už daná návrhem #0 (volba A „stav chaty teď"). Soubor
`docs/design/01-prehled-atomy.html`, stejná Akcion mechanika jako #0. Pět dílů A/B/C:

1. **Hero chaty (H1a)** — A kompaktní pruh *(dop.)* · B velký fotohero · C bez fotky, barevný pruh.
2. **Co je na Přehledu a v jakém pořadí** — A prioritní stack *(dop.)* · B mřížka 2×2 · C jedna velká + sbalené.
3. **„Co visí na tobě"** — A akční karta s tlačítkem *(dop.)* · B checklist · C banner/nudge.
4. **Řetězec turnusu na Přehledu** — A textový řádek teď→pak *(dop.)* · B mini časová osa · C vynechat (jen Kalendář).
5. **První dojem / prázdný stav (X2, E2)** — A pozvánka + ilustrace *(dop.)* · B co appka umí · C minimal.

→ **Odsouhlaseno 2026-11-21: všech 5 dílů = A (doporučené).** Přehled = kompaktní pruh s jménem
chaty · prioritní stack karet · „co visí na tobě" jako akční karta s tlačítkem · řetězec jako
textový řádek teď→pak · prázdný stav jako pozvánka + ilustrace (Midjourney). Tato rozhodnutí jsou
obsahová a **platí na mobilu i desktopu**.

## Desktop vs. mobil (postup odsouhlasen 2026-11-21)

Appka má **mobil i desktop** (není mobil-only): `PRODUCT.md` „mobil **první**" = primárně 360–430 px,
ne výhradně; current app už má `desktop-topbar`/`desktop-primary-nav`; smoke test = „desktop admin +
mobilní člen". Dohoda o postupu:

1. **Obsahová rozhodnutí se dělají mobil-first** (návrh #1 atd.) — platí na obou, nemění se šířkou.
2. **Desktop = globální rám**, rozhodnutý jednou v návrhu **#1b** (ne pětkrát zvlášť): navigace
   (sidebar vs. topbar), rozložení v šířce (1/2/3 sloupce), max šířka obsahu.
3. **Od návrhu #2 dál** každý picker ukáže **mobil i desktop rámeček vedle sebe** (rám je zamčený).

## Návrh #1b — Desktop rám (čeká na volbu)

Soubor `docs/design/01b-desktop-ram-atomy.html`. Tři díly A/B/C na obsahu Přehledu (volba #1 = A):

1. **Hlavní navigace v šířce** — A levý sidebar (ikona + label) *(dop.)* · B horní lišta · C sbalený sidebar (jen ikony).
2. **Rozložení Přehledu v šířce** — A dva sloupce (hlavní + boční panel) *(dop.)* · B tři sloupce · C jeden centrovaný sloupec.
3. **Šířka obsahu** — A omezená čitelná šířka, klid po stranách *(dop.)* · B full-width roztažené.

**Odsouhlaseno 2026-11-21: všechny 3 díly = A** (sidebar · dva sloupce · čitelná šířka).

## Návrh #2 — Předávka „předat chatu" (čeká na volbu)

Soubor `docs/design/02-predavka-atomy.html`, **dvojrámečkově (mobil + desktop)**. Grounded v realitě
(subagent zmapoval kód): dnes **dva nepropojené toky** — strukturovaný `CheckoutSection` (ukládá
`checkoutState` na rezervaci) + legacy `DepartureBanner` (jen pošle zprávu). Redesign je **sjednotí
do jedné obrazovky s vlastním tabem**. Reálná pole: `gas` (full/half/low/empty) · `heatingOff` ·
`waterOff` · `broken` · `leftBehind` · `note`. Klíče/foto/podpis v modelu **nejsou** (→ varianta
text-C je vědomě označená jako V2). Pět dílů A/B/C:

1. **Jak se vyplňuje** — A jedna krátká stránka *(dop.)* · B krokový průvodce · C rychlé dlaždice.
2. **Zadání stavu** — A segmenty + přepínače *(dop.)* · B ikonové dlaždice · C odškrtávací checklist.
3. **Závady/nechávám/vzkaz** — A tři oddělené karty *(dop.)* · B vzkaz + závada zvlášť · C vzkaz + fotka (⚠ V2).
4. **Dokončení „Předat chatu"** — A potvrdit → shrnutí *(dop.)* · B náhled „co uvidí další" (desktop = boční panel) · C potvrdit + do WhatsAppu (X1).
5. **Tab mimo den odjezdu** — A poslední předávka + čekání *(dop.)* · B prázdný stav + odkaz · C vždy editovatelné.

Legacy dluh k vyřešení ve Fázi 5: sjednotit dva toky, narovnat `departingToday` gate (dnes čte staré
`handoverNote`, ne `isCheckoutCompleted`), vyčistit terminologii „handoverNote" (tři různé významy).

**Odsouhlaseno 2026-11-21: všech 5 dílů = A.** Jedna krátká stránka · segmenty + přepínače · tři
oddělené karty · potvrdit → shrnutí · tab mimo odjezd ukáže poslední předávku + čekání.

## Návrh #3 — Příjezdová karta „přivítání" (čeká na volbu)

Soubor `docs/design/03-prijezd-atomy.html`, dvojrámečkově. Druhý konec páru D1→B1: co **čtu, když
přijíždím**. Grounded: dnešní `buildArrivalBriefing()` (`ActiveReservation.tsx`) čte poslední
`checkoutState` a zobrazí „Od minule — …". Je to **zrcadlo Předávky** (stejná pole, read-only) a
kanonický povrch „od minule", který přebírá i tab Předávka (volba 2 = 5A). Pět dílů A/B/C:

1. **Kde a kdy se objeví** — A na Přehledu jako hero v den/před příjezdem *(dop.)* · B samostatná uvítací obrazovka · C jen řádek + detail na proklik.
2. **Co karta ukazuje** — A stav od minule + vzkaz + co dochází *(dop.)* · B jen vzkaz + stav (minimal) · C plný briefing vč. praktické orientace (wifi/topení ⚠ V2).
3. **Jak ukazuje „stav od minule"** — A stejný vizuál jako předávka, read-only *(dop.)* · B vyprávěcí věta · C odškrtnutelný „zkontroluj při příjezdu".
4. **Vzkaz od předchozího** — A osobní citace nahoře *(dop.)* · B v řadě s fakty · C pod „víc".
5. **Co nabídne dál** — A „Potvrdit příjezd" + odkaz do Zásob *(dop.)* · B jen info, bez akce · C „Nahlásit problém" prominentně.

**Odsouhlaseno 2026-11-21: všech 5 dílů = A.** Hero na Přehledu (v den/před příjezdem, pak se
stáhne) · ukazuje stav od minule + vzkaz + co dochází · stav od minule jako zrcadlo předávky
(read-only) · vzkaz jako osobní citace nahoře · dole „Potvrdit příjezd" + odkaz do Zásob.

> **Carry-forward do Fáze 5 (platí i pro Předávku #2 — stejný vizuál plynu).** Uživatel u dílu 3:
> *„Sám bych ale nevěděl co znamená Plný / Půl … Dochází a Došlo/Prázdný je jasný."* Segmenty plynu
> `Plný · Půl · Dochází · Prázdný` (model `gas` = full/half/low/empty) nejsou samy o sobě čitelné —
> „Plný/Půl" nenese akci ani jasný význam na první pohled. Při implementaci read-only stavu: popsat,
> **čeho** se úroveň týká (plynová bomba), a zvážit, zda „Plný/Půl" vůbec ukazovat zvlášť, nebo
> sjednotit na „v pořádku" vs. „dochází/došlo" (akční stavy). Zrcadlí se v Předávce i v příjezdu.

> **Rozhodnuto 2026-11-21 (#166 = A):** popisek **„Plynová bomba"** a tři stavy slovy
> **Dostatek · Dochází · Došlo** — stejný slovník jako Zásoby. Mapování z modelu: `full` i `half` →
> Dostatek, `low` → Dochází, `empty` → Došlo; v Předávce se zapisují jen tři hodnoty (`full`/`low`/
> `empty`), staré `half` se jen čte jako Dostatek. Bez migrace (`gas` leží v JSON `checkoutState`).
> Platí pro Předávku #2, příjezdovou kartu #3 i nudge.

### Pravidlo „co patří na dashboard" (z poznámky uživatele u dvou sloupců)

Uživatel: *„být hodně opatrný s tím, co kam dát a jestli to má opravdu užitek mít na dashboardu."*
Závazný filtr pro Přehled (mobil i desktop, platí i pro další obrazovky):

- **Karta si místo na dashboardu zaslouží jen když je buď (a) akční teď, nebo (b) odpovídá „v jakém
  stavu chata je" na první pohled.** Co není ani jedno, žije ve své sekci, ne na Přehledu.
- **Nulové/prázdné stavy se nezobrazují jako karta.** Žádné „nic nechybí" / „nic nevisí" dlaždice —
  karta naskočí jen když má co říct. (Prázdný *celý* Přehled = stav E2 pozvánka, to je něco jiného.)
- **Rozdělení sloupců (desktop, volba A):** hlavní (vlevo) = akce + stav, který po mně něco chce —
  „visí na tobě" (jen když visí) a „na chatě teď" (+ tenký řádek řetězce pak→ty). Boční panel
  (vpravo) = lehký kontext — „další příjezd" a „dochází" (jen když fakt něco dochází, kompakt + odkaz
  do Zásob). Boční panel nikdy nenese akci, kterou nesmím minout.

## Návrh #4 — Rezervace + kalendář + řetězec (čeká na volbu)

Soubor `docs/design/04-rezervace-atomy.html`, dvojrámečkově. Srdce plánování: kalendář rezervací +
založení pobytu + řetězec turnusu (A1/A2 z Fáze 3). Grounded (subagent zmapoval kód): dnes **měsíční
mřížka** Po–Ne (`CalendarGrid.tsx`), v buňce **max 1 pruh + „+N"** (`CalendarCell.tsx`), barva = kdo
(z `user.color`), typ **pevná / předběžná / záložní** (`status`; „backup" přiřazuje server při kolizi
primary). Založení je dnes **matoucí dvoufázový klik** (první klik jen filtruje seznam, druhý začíná
rozsah → choice modal rezervace/dovolená). Řetězec „teď→pak" **v kalendáři vůbec není** — žije jen na
dashboardu jako seznam (`ActiveReservation.tsx`). Pět dílů A/B/C:

1. **Hlavní pohled na čas** — A měsíční mřížka *(dop.)* · B agenda/seznam turnusů · C měsíc + seznam pod ním.
2. **Jak den ukáže obsazenost** — A jeden pruh + „+N" *(dop., dnešní)* · B víc tenkých pruhů · C barevná výplň dne.
3. **Řetězec turnusu tady** — A řádek teď→pak nad kalendářem *(dop.)* · B mini časová osa · C jen na Přehledu.
4. **Jak založím rezervaci** — A táhni rozsah → formulář *(dop.)* · B tlačítko „+ Nová rezervace" · C obojí.
5. **Formulář rezervace** — A podstatné + rozbalit víc *(dop.)* · B vše na jedné stránce (dnešní) · C krokový průvodce.

**Odsouhlaseno 2026-11-21: všech 5 dílů = A.** Měsíční mřížka · jeden pruh + „+N" · řádek teď→pak
nad kalendářem · táhni rozsah → formulář · formulář podstatné + rozbalit „Víc".

> **Carry-forward do Fáze 5 (desktop rám kalendáře).** Uživatel u dílu 1: *„Ten desktop se mi nelíbí
> — pravá část pod tlačítkem + Nová rezervace. Mělo by tam být víc místa a layout si toho může dovolit
> víc, než co je tam teď. Z pohledu ovladatelnosti a přehlednosti bych zachoval formu, co máme teď,
> ale klidně ji poupravil. Kalendář sám mi nepřišel špatný."* Tzn.: **měsíční mřížka zůstává**, ale
> **pravý panel na desktopu je v návrhu poddimenzovaný** (tenký řetězec + mini agenda = málo). Při
> implementaci narvat do pravého sloupce bohatší obsah — plnohodnotný seznam turnusů / detail vybrané
> rezervace, lepší využití šířky; vyjít z dnešního pravého panelu (`ReservationList.tsx`) a jen ho
> poupravit, ne zužovat. Platí jen pro desktop; mobilní mřížka je OK.

Legacy dluh k vyřešení ve Fázi 5: **dva nepropojené toky** (kalendář `GET /reservations` × dashboard
`GET /dashboard/reservations`); `checkoutState` je netypovaný `Json?` (tvar drží jen
`sanitizeCheckoutState` + zdvojený TS typ); **off-by-one past** u datumů (`CalendarCell` čte UTC,
`BookingForm` lokální čas); `handoverNote` na dvou úrovních (per-rezervace × app-level pinned);
mazání jen přes `POST /reservations/delete` (není `DELETE /reservations/:id`).

## Návrh #5 — Zásoby a nákupy (čeká na volbu)

Soubor `docs/design/05-zasoby-atomy.html`, dvojrámečkově. Poslední obrazovka V1 (klín C1 z příjezdu).
Grounded (subagent zmapoval kód): jsou to **dva oddělené modely v jedné feature** (`shopping/`) —
**Zásoby na chatě** (`InventoryItem`, tří-stav `OK/LOW/EMPTY` = Dostatek/Málo/Došlo, kategorie,
location, isEssential) × **Nákupní seznam** (`ShoppingList` + `ShoppingListItem`: checkbox koupeno,
`bring_from_home`, isEssential ★, cena + dělení útraty `ShoppingItemSplit`). Dnes přepínané přes
`ViewSwitcher`. Smyčku dělá „Přidat do nákupu" (`linkedInventoryId` → po koupení zásoba auto `OK`).
Missing-summary dialog po rezervaci existuje. Pět dílů A/B/C:

1. **Zásoby × Nákup: jak je držet** — A přepínač dvou režimů *(dop., dnešní)* · B jedna obrazovka · C nákup primární, spíž vedle.
2. **Jak se čte stav zásoby** — A tři stavy slovy Dostatek/Dochází/Došlo *(dop.)* · B dva stavy Je/Dochází · C semafor barva + slovo.
3. **Jak se zásoby člení** — A podle kategorie *(dop., dnešní)* · B podle stavu · C plochý seznam + filtr.
4. **Z „dochází" do nákupu** — A tlačítko u položky + „Vše do nákupu" *(dop., dnešní)* · B appka sama nabídne · C plně automaticky.
5. **Nákupní položka** — A koupeno + rychlé značky *(dop.)* · B jen koupeno + název · C + cena a dělení útraty.

U dílu 2 varianta A vědomě aplikuje carry-forward z návrhu #3 (čitelná slova: „Málo" → „Dochází").

**Odsouhlaseno 2026-11-21: všech 5 dílů = A.** Přepínač dvou režimů · tři stavy slovy
(Dostatek/Dochází/Došlo) · členění podle kategorie · tlačítko u položky + „Vše do nákupu" · nákupní
položka s koupeno + rychlými značkami. Tím je **V1 rozsah Fáze 4 kompletní** (návrhy #0–#5 ✅).

Tři carry-forward poznámky do Fáze 5:

> **(díl 1 — desktop dva sloupce).** Uživatel: *„Udělejme ty dva sloupce tak, aby se zaprvé daly
> položky z jednoho přesouvat do druhého, a zadruhé aby bylo jasně a přehledně oddělené, co je co."*
> Tzn. desktop Zásoby × Nákup vedle sebe: (a) **přesun položky mezi sloupci** (drag-and-drop nebo
> akce „→ do nákupu" přímo mezi panely, navázat na smyčku `linkedInventoryId`), (b) **výrazné vizuální
> oddělení** obou sloupců, ať je jasné, co je stav spíže a co nákupní seznam.

> **(díl 4 — zarovnání badge × „+").** Uživatel: *„Nelíbí se mi, jak máme badge a vedle +, a tam, kde
> není +, je badge víc vpravo. + dejme vedle pole, ne do pole."* Detail layoutu řádku zásoby: dnes
> (i v mocku) se u řádků s tlačítkem badge posune doleva kvůli „+", u řádků bez „+" je badge úplně
> vpravo → **badge nedrží svislé zarovnání**. Řešení: „+" dát **mimo řádek / vedle něj** (vlastní
> sloupec akcí), aby badge byly v jedné svislé lince bez ohledu na to, zda má řádek akci.

> **(díl 5 — systém značek nákupní položky = samostatný návrh).** Uživatel: *„Je potřeba vyladit
> logiku a přehlednost těch badge — ze zásob, z domova, hvězdička atp. Musí to mít jednolitou
> funkcionalitu pro všechny druhy. Klidně na to udělejme samostatný grill-me nebo návrh jako tenhle,
> jen samostatně na tu jednu logiku a zobrazení."* → **Follow-up ve Fázi 5/4b:** samostatný picker
> (nebo grilling) jen na **systém značek nákupní položky** — sjednotit, co které značky znamenají
> (`ze zásob` = `linkedInventoryId`, `z domova` = `bring_from_home`, ★ = `isEssential`, kdo koupil),
> jak se chovají, kde se zobrazují a priorita/pořadí, aby měly jednotnou mechaniku.

> **Rozhodnuto 2026-11-21 (#167 = A):** vlevo **stav nákupní položky se třemi hodnotami — Koupit /
> Přivezu z domova / Koupeno**; u „Přivezu z domova" i „Koupeno" avatar toho, kdo to zařídil.
> **★ (`isEssential`) je jediný signál důležitosti.** „Ze zásob" = tichý štítek podle
> `linkedInventoryId` (ne podle ★). „Přivezu z domova" se počítá jako vyřešené: propojená zásoba se
> přepne na Dostatek už při slibu (ne až po přivezení) a položka s ★ přestane svítit ve varování na
> Přehledu. Bez migrace. Podklad a varianty: komentář v #167.

Legacy dluh k vyřešení ve Fázi 5: **mrtvý druhý „pantry" koncept** (`ShoppingList.isPantry` +
`/shopping-lists/pantry` + `move-from-pantry` — UI je nepoužívá, čte `InventoryItem`); **dva route
soubory** nákupu (`shoppingList.ts` singular legacy × `shoppingLists.ts` plural); redundantní
`purchased` Boolean × `status` enum na položce; `category` je volný string (ne enum); **tři různé
definice „co chybí/dochází"** (pantry = jen EMPTY, nudge = LOW+EMPTY, dashboard z nákupního seznamu);
rozbitá diakritika v backend stringech (mojibake).

## Návrh #6 — Přehled v2 podle průzkumu (čeká na volbu)

Soubor `docs/design/06-prehled-v2-atomy.html`. Vznikl 2026-11-22 spojením dvou ranních pickerů
Přehledu (`~/.gstack/projects/Reathyze20-Cabin_Reservation_App/designs/prehled-mobil-20261122` a
`prehled-uupm-20261122`, nikdy nevyplněné) s externím UX/UI průzkumem domovské obrazovky. Průzkum
potvrdil směr #1 (stav → akce → pozornost, akční karta, dva sloupce, bez skla) a přinesl revizi
pravidel E3, E4, B2, G3, G4 (viz [pravidla](redesign-faze-4-pravidla.md), sekce „Revize 2026-11-22“).
Situace v náhledech: ne 22. 11., „ty“ odjíždíš, ve středu přijede Petr, dochází plynová bomba,
došel toaleťák, Petr nahlásil kapající kohoutek. Fiktivní data, barvy z navržené palety.

**Skupina 1 — Co je na Přehledu** (mobil + desktop, červená čára = konec první obrazovky):
1. **Kostra** — A Štafeta: stav → visí na tobě → pozornost → osa s volnem *(dop.)* · B Osa chaty (ranní ui-ux-pro-max) · C Jeden velký úkol.
2. **Stavová hlavička** — A teď → příště v jedné kartě *(dop.)* · B dvě dlaždice · C karta + řádek řetězce (dnešní).
3. **Visí na tobě** — A karta s jedním tlačítkem *(dop.)* · B tlačítko u „Teď“ v ose · C přilepené dole.
4. **Potřebuje pozornost** — A max. 3 řádky s „Koupím já“ + Do WhatsAppu *(dop.)* · B jeden pruh + „další“ · C souhrnný řádek.
5. **Kdo jede a kdy je volno** — A osa s piny a volnem v toku *(dop.)* · B řádky jako diář · C pobyty + karta volného víkendu (dnešní).
6. **Čerstvost dat** — A jen offline / staré údaje + „Čeká na odeslání“ *(dop.)* · B vždy tichý řádek · C ikona v liště.
7. **Instalace na plochu** — A lišta na konci *(dop.)* · B karta po 3. návštěvě · C plovoucí banner (dnešní).

**Skupina 2 — Vzhled v celé aplikaci** (vzorky ve skutečné velikosti):
8. **Barvy členů** — A ověřená paleta 8 barev (bílý text 5,7–7,6:1) *(dop.)* · B moje × ostatní · C dnešních 14.
9. **Velikost textu** — A 16/14 px *(dop.)* · B 18/16 px · C 15/13 px (dnešní).
10. **Dotyk** — A 56 hlavní / 48 ostatní *(dop.)* · B 48 všude · C 44 px.
11. **Písmo** — A Plus Jakarta Sans *(dop.)* · B Atkinson Hyperlegible Next · C Figtree.
12. **Pozadí** — A lesní mlha (dnešní) *(dop.)* · B teplý papír · C bílá.

**Skupina 3 — Texty:** 13. **Oslovení** — A tykání *(dop.)* · B vykání.

**Odsouhlaseno 2026-11-22:** kostra **A Štafeta** · hlavička **A teď → příště** · visí na tobě
**A karta s tlačítkem** · pozornost **A + C** · osa **A s piny a volnem** · čerstvost **A jen když je
to důležité** · instalace **B karta jednou po 3. návštěvě** · barvy **A paleta 8** · text **A 16/14 px**
· dotyk **A 56/48 px** · písmo **A Plus Jakarta Sans** · pozadí **A lesní mlha** · oslovení **A tykání**.

> **Upřesnění 1 – duplicita (poznámka uživatele ke kostře) — potvrzeno 2026-11-22:** *„Hodně se tam ale duplikuje kdy
> jede Petr atp.“* Petr je ve variantě A čtyřikrát: v hlavičce (příště), v textu akce, jako první
> zastávka osy a v bočním panelu „Další příjezd“. **Rozhodnuto:** každý údaj má jedno
> místo. Hlavička = teď → příště, a to je jediné místo s jménem a datem dalšího. Osa začíná **až za
> ním** (nadpis „Potom“, první zastávka je volno nebo další pobyt). Karta „Další příjezd“ zaniká
> a její detail (účel · noci · s kým) jde na desktopu do hlavičky pod „příště“. Jméno v textu akce
> („Předej chatu Petrovi“) zůstává, protože říká, pro koho to dělám.
>
> **Upřesnění 2 – pozornost A + C — potvrzeno 2026-11-22:** nejvýš 3 řádky s akcí (A). Když je
> věcí víc, poslední řádek je souhrn C „+ N dalších potřebuje pozornost →“ místo „Všechny zásoby“.
> Při 0 věcech karta není.

> **Upřesnění 3 – akce v okolí chaty (nápad uživatele u kostry):** *„přemýšlím o další zajímavé
> funkcionalitě, že bychom tam mohli mít akce, co jsou v okolí chaty, a filtr třeba do 10 km, do
> 20 km, do 50 km jako další část přehledu.“* Agent navrhl parkoviště (nová oblast). **Uživatel
> 2026-11-22: „se bude dělat v rámci redesignu.“** → nová položka **D3 (mini-design): Akce v okolí**.
> Před tickety rozhodnout: (a) **zdroj dat** o akcích v ČR (research, nic se nevymýšlí), (b) kde
> přesně na Přehledu je a kdy se ukazuje (pravidlo „co patří na dashboard“), (c) filtr
> 10 / 20 / 50 km, (d) poloha chaty (dnes `address` a `weatherLocation` jako text, souřadnice nejsou).
>
> **(d) rozhodnuto 2026-11-22 → [ADR-0006](../adr/0006-chata-je-anonymni.md) Chata je anonymní.**
> Poloha = **nejbližší obec**, vybraná ze seznamu (název + okres) při zadávání chaty. Její
> souřadnice slouží filtru akcí i počasí. Přesnou adresu appka nesbírá; sloupec `Cabin.address`
> jde k odstranění (contract migrace, schvaluje člověk).

> **(a) rozhodnuto 2026-11-22 („podle doporučení“).** Research zdrojů je v #281. Jediný zdroj,
> který pokrývá akce na venkově (poutě, trhy, akce obcí) a má u akcí polohu, je **Kudy z nudy**
> (CzechTourism). Přístup k jejich API mají jen smluvní partneři a přidělování je podle jejich
> FAQ pozastavené. Ticketmaster vrací skoro jen velké akce ve městech a podmínky zakazují komerci,
> proto ho **nebereme**. Ruční zadávání akcí rodinou také ne.
> 1. **Uživatel požádá CzechTourism o přístup** (katalog@czechtourism.cz). Text e-mailu připraví agent.
> 2. **Do té doby jen odkaz ven:** na Přehledu odkaz „Akce v okolí“ na kalendář Kudy z nudy pro kraj
>    chaty, `https://www.kudyznudy.cz/kalendar-akci/<kraj>` (např. `jihocesky-kraj`, `kraj-vysocina`).
>    Nic se nestahuje ani neukládá. Kraj se odvodí z vybrané obce (#279, číselník RÚIAN). Filtr podle
>    okresu ani okruhu v km Kudy z nudy v URL nemá. Ticket #283 (blokuje #279).
> 3. **(b) a (c) až podle odpovědi CzechTourism.** Karta s akcemi a filtrem 10 / 20 / 50 km dává smysl
>    jen s daty s polohou. Když přístup nedostanou, zůstane odkaz.

**Tickety (2026-11-22):** nadřazené #268 (sub-issue #66). #269 kontrast štítků · #270 text 16 px +
dotyk 48/56 · #271 paleta členů · #272 hlavička teď → příště · #273 osa „Potom“ s volnem (blokuje
#272) · #274 jedna výzva „Visí na tobě“ (blokuje #255) · #275 „Potřebuje pozornost“ · #276 offline a
stáří dat · #277 karta instalace · #278 tykání · #279 výběr nejbližší obce · #280 odstranit
`Cabin.address` (pro člověka) · #281 mini-design D3 akce v okolí. „Koupím já“ = slib „Přivezu
z domova“ (#167), rozhodl uživatel 2026-11-22.

Poznámky pro stavbu: „Koupím já“ (díl 4A) je tentýž slib jako „Přivezu z domova“ z #167. Navržená paleta: `#1D5FA8`
modrá, `#B3401A` cihlová, `#7A3FA0` fialová, `#1F6F4A` jedlová, `#0E6F7C` petrolejová, `#8A5A00`
okrová, `#A6306A` vínová, `#4B5563` břidlicová. Stávající barvy členů se přemapují na nejbližší
barvu z palety, bez migrace.

## Rozhodnutí o ikonografii (odsouhlaseno 2026-11-21)

Uživatel: *„emoji je to nejhorší, co může appka mít"*; má předplatné Midjourney, custom ikony
vítá, kvalitní placenou sadu je ochoten koupit. Klíčový rozdíl, který je potřeba držet:

- **UI ikony** (navigace, tlačítka, stavy, drobné akce) → **Lucide** *(doporučeno)*. Už je ve
  stacku (`lucide-react`), konzistentní vektorová line sada, laditelná barvou/velikostí, zdarma,
  profesionální. **Midjourney se na malé UI ikony nehodí** — nedělá konzistentní sadu v jednom
  stylu a tloušťce, je rastrové. Pokud bude chtít výraznější „custom look", koupit hotovou line
  sadu (např. Phosphor / Streamline), ne generovat jednotlivě.
- **Ilustrace a atmosféra** (hero chaty, prázdné stavy, přihlášení, osobnost H1a) → **Midjourney**
  *(tady dává smysl)*. Atmosférické obrázky lesa/chaty, „nádech té vaší chaty". Smysluplné využití
  předplatného, oddělené od funkční ikonografie.

→ **Odsouhlaseno 2026-11-21:** Lucide pro UI ikony, Midjourney jen na atmosféru/ilustrace.

## Otevřené (necommitnuté) soubory redesignu

**Vyřešeno 2026-11-21:** dokumenty redesignu (Fáze 1–4 + `docs/design/*` + ADR-0004/0005) jdou do
vlastní větve z `main` a samostatného PR (volba a), odděleně od `chore/161-staging-verify-harness`.
