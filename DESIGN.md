# DESIGN.md – jak Kdy na chatu vypadá a mluví

Jediný závazný zdroj pravdy pro vzhled aplikace (spec #445). Řídí se jím člověk i agent, který píše nebo převádí obrazovku, a `/code-review` při posuzování UI diffu. Když se s ním jiný dokument rozchází (skill `CabinSaaS_Architect`, `docs/plans/redesign-faze-4-*`, mockupy v `docs/design/`), platí tento. Mockupy jsou archiv a inspirace, ne pravidla.

Hodnoty tokenů žijí v kódu (`frontend-v2/src/styles/variables.css`, `shadcn-tokens.css`). Tento dokument říká, který token, komponentu a vzor použít. Konkrétní hex hodnoty proto neopisuje. Co ještě neexistuje, je označené **Cíl** s číslem ticketu. Do té doby platí pravidlo, jen kanonická komponenta nebo guard chybí.

## 1. Principy a směr

- **Jedle a teplý papír.** Obsah leží na plných kartách v barvě starého papíru nad titulní fotkou chaty pod teplým závojem (`AppBackdrop`). Žádné bílé ani skleněné karty, žádné studené šedi.
- **Klid.** Málo prvků, jasná hierarchie, mezi kartami vzduch. Appka neupozorňuje sama na sebe.
- **Jeden akcent.** Zelená Jedle (`--brand-primary`) patří hlavní akci, aktivní položce navigace a odkazům. Všechno ostatní je inkoust, tlumená hnědá a papír.
- **Tichý tón.** Varování a stavy nese tónovaná ikona, krátký štítek nebo jemné pozadí z tokenů. Hlasitý banner ani barevný proužek vlevo (#355) se nepoužívá.
- **Mobil první.** Navrhuje se pro 360–430 px (`docs/PRODUCT.md`). Obrazovka musí fungovat od 320 px. Desktop má boční panel `DesktopSidebar` a obsah do 1440 px.
- **Jen světlý režim a jedno téma.** Tmavý režim (`.dark`), tenant témata (`[data-theme]`) a `next-themes` jsou mrtvý kód a odstraní je #458. Nový kód je nepodporuje a nepíše varianty `dark:`.
- **Přístupnost od začátku.** Kontrast textu ≥ 4,5 : 1, prvků UI ≥ 3 : 1. Viditelný focus, ovládání z klávesnice, respekt k `prefers-reduced-motion`. Barva člena nikdy nestojí sama, vždy s iniciálou nebo avatarem a jménem.
- **Nová barva nebo písmo je rozhodnutí uživatele.** Agent udělá picker v `docs/design/` (vzor `10-zelena-atomy.html`) a nechá vybrat.

## 2. Tokeny

### Vrstvy

| Vrstva | Proměnné | Kdo je smí použít |
|---|---|---|
| Surová paleta | `--raw-*` | jen definice tokenů ve `variables.css` |
| Sémantické tokeny | `--text-*`, `--bg-*`, `--brand-*`, `--status-*`, `--border-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--font-*`, `--transition-*`, `--z-*`, `--touch-target-*` | všechny komponenty |
| Povrchy redesignu | `--page`, `--sheet`, `--sheet-alt`, `--inset`, `--rule`, `--rule-soft`, `--glow`, `--lift`, `--ok`/`--low`/`--empty` a jejich `-bg` | všechny komponenty. Jsou to RGB trojice, s alfou `rgb(var(--sheet) / .96)` |
| Most shadcn | `--primary`, `--muted-foreground`, `--border`, `--input`, `--ring` … (`shadcn-tokens.css`) | primitiva `ui/` a utility z `@theme` |
| Legacy aliasy | `--color-*` | **deprecated**. Nový kód je nepoužívá, stávající výskyty jsou v allowlistu (#450) |

### Jak token použít

- **TSX:** utility z `@theme`: `bg-primary`, `text-primary`, `bg-accent`, `bg-destructive`, `text-muted-foreground`, `border-input`, `ring-ring`, `bg-sheet`, `bg-inset`, `border-rule-soft`, `shadow-lift`. Token bez utility se píše zkratkou Tailwindu 4 `text-(--text-muted)`, `hover:bg-(--brand-primary-hover)`, `min-h-(--touch-target-min)`.
- **CSS:** `var(--token)`. Inline `style` jen s `var(--token)`.
- **Mezery:** v TSX škála Tailwindu (násobky 4 px), v CSS `--space-xs` … `--space-3xl` (4–48 px).
- **Z-index:** jen škála `--z-*`, nikdy surové číslo.

### Role barev a ploch

| Role | Token / utility |
|---|---|
| Hlavní text | `--text-main` (teplý inkoust) |
| Vedlejší text, popisky | `--text-muted` (kontrast ≥ 4,5 : 1 hlídá `mutedTextContrast.test.ts`) |
| Placeholder, zakázaný text | `--text-placeholder`, `--text-disabled` |
| Text na zelené / červené | `--text-on-primary`, `--text-on-danger` |
| Hlavní akce, aktivní navigace, odkaz | `bg-primary` / `text-primary`, hover `--brand-primary-hover` |
| Zvýrazněná / vybraná plocha | `bg-accent` (`--brand-primary-light`, 10 % Jedle v papíru) |
| Hover řádku | `--bg-hover` |
| Karta | `bg-sheet` + `border-rule-soft` + `shadow-lift` |
| Vnořené pole v kartě (dny, záložky) | `bg-inset` |
| Podklad pod kartami | `--bg-app-backdrop` (řeší shell, stránka ho nenastavuje) |
| Chyba, úspěch, varování, info | `--status-error` / `-success` / `-warning` / `-info`, podbarvení `-light` |
| Štítky zásob a plynu (Dostatek · Dochází · Došlo) | text `rgb(var(--ok))` / `--low` / `--empty`, podbarvení `--ok-bg` / `--low-bg` / `--empty-bg` |

`--bg-card` (bílá) je legacy povrch. Nová karta je papír, ne bílá.

### Co se nepíše

- Surový hex nebo `rgb()`/`rgba()` s čísly mimo soubory s definicí tokenů. `rgb(var(--sheet))` je token, ne surová barva.
- Barvy z palety Tailwindu (`slate-*`, `emerald-*`, `teal-*`, `red-600`, `bg-white` …). Nový kód bere barvu jen z tokenů. `emerald-*` a `teal-*` hlídá `noEmeraldTeal.test.ts`, `slate-*`, `emerald-*` a `bg-white` guard `coldPalette` a ESLint.
- Barevný levý okraj karty, pole, citace nebo řádku (`noLeftStripes.test.ts`).
- `backdrop-blur` na obsahové kartě. Sklo jen jako akcent: modál, overlay, toast, lišta (`lightSurfaces.test.tsx`).

### Breakpointy a styly

- Jen Tailwind `md` (768 px) a `lg` (1024 px). Mobil je pod `md`, desktopový rám od `md`, široký desktop od `lg` (`WIDE_DESKTOP_QUERY`). V CSS a `matchMedia` jen `min-width: 768px` / `1024px`, pro „pod“ `max-width: 767px` / `1023px`. Container query (`@max-[280px]:`) breakpoint není. Legacy páry `max-width: 768px` / `min-width: 769px` a ostatní šířky jsou v allowlistu (#450).
- Jediná výjimka je uvnitř `Modal`: do 640 px se zobrazí jako bottom sheet (#453). Obrazovky si vlastní práh nezavádějí.
- Nový soubor `.css` nevzniká. Nový vzhled se píše utilitami Tailwindu nad tokeny v TSX. Stávající CSS se mění jen při převodu obrazovky.

## 3. Typografie

- **Plus Jakarta Sans** (`--font-family`) v řezech **400, 500, 600 a 700**, víc se nenačítá (`index.html`). Řez 800 a 900 i utility `font-extrabold` a `font-black` se nepíšou, prohlížeč by tučnost dopočítával (guard `fontWeight`).
- Charakterové písmo pro nadpisy se nepoužívá (pravidlo C3 z fáze 4 je zrušené). Další rodinu písma přidává jen uživatel.
- **Kalam** (`--font-diary`) jen v Deníku pobytů, tedy v `styles/diary.css`: zápisník (hlavička, datum, text zápisu), náhled zápisu, data složek a prázdný stav deníku. Jinde se ruční písmo nepoužívá (guard `diaryFont`).

### Typová škála

Vybírá se role, ne velikost v pixelech. Utilita `text-<role>` nastaví velikost, řez, výšku řádku a prostrkání. Barvu nenese, ta se píše zvlášť (`text-(--text-main)`, `text-(--text-muted)`), eyebrow navíc `uppercase`. V CSS se použije uvedený token velikosti a řez.

| Role | Utilita | Prvek | Velikost | Řez | Barva |
|---|---|---|---|---|---|
| Titulek stránky | `text-page-title` | `h1` v `PageHeader` | `--font-size-2xl` (24 px) | 700 | `--text-main` |
| Nadpis karty | `text-card-title` | `h2` (vnořený `h3`) | `--font-size-base` (16 px) | 600 | `--text-main` |
| Tělo | `text-body` | odstavec, položka seznamu | `--font-size-base` (16 px) | 400 | `--text-main` |
| Popisek | `text-label` | popisek pole, nápověda, text pod hodnotou | `--font-size-sm` (14 px) | 500 | `--text-muted` |
| Meta | `text-meta` | čas, autor, počet | `--font-size-sm` (14 px) | 400 | `--text-muted` |
| Eyebrow | `text-eyebrow uppercase` | krátký štítek nad nadpisem nebo hodnotou, stavový štítek | `--font-size-sm` (14 px) | 700, kapitálky, prostrkání 0,06em | `--text-muted` |

- Minimum je 14 px, běžný text 16 px (G3). `--font-size-xs` je alias pro 14 px a ani utilita `text-xs` menší písmo nedá (`textAndTouchTokens.test.ts`).
- **Nadpisy karet ve větné velikosti písmen** („Visí na tobě“, „Na chatě teď“). Kapitálky s prostrkáním patří jen eyebrow štítku a stavovému štítku (rozhodnutí #425).

## 4. Ikony

- Jen `lucide-react`. Jinou ikonovou sadu zakazuje ESLint `no-restricted-imports`. Emoji ani unicode dingbaty nejsou ikony (`uiIconography.test.ts`).
- Velikosti jen **16, 20 a 24 px**: 16 v textu a v tlačítku s textem, 20 jako samostatná ikona (ikonové tlačítko, navigace), 24 v `EmptyState`. Stávající 14, 18, 28, 48 px a další odchylky jsou v allowlistu (guard `iconSize`).
- Inline `<svg>` jen z allowlistu: logo, ilustrace landing page, prázdné stavy (guard `inlineSvg`). Trvalou výjimkou je `GlobalFallback`, který nesmí záviset na lucide.
- Každá ikona něco sděluje, dekorace to není. Ikona vedle textu má `aria-hidden`, ikonové tlačítko má `aria-label` a cíl 48 × 48 px.

## 5. Pohyb

- Pohyb vysvětluje, co se stalo, nepředvádí se. Trvání 150–300 ms: `--transition-fast` (0,15 s), `--transition-base` (0,2 s), `--transition-slow` (0,3 s). Ve Framer Motion `duration` 0.15–0.3.
- Vstup `easeOut`, odchod `easeIn`, nikdy lineárně. Animují se `opacity` a `transform`, ne rozměry a pozice (`width`, `height`, `top`, `left`).
- Animuje se otevření a zavření modálu, přidání a odebrání položky seznamu, rozbalení a přepnutí záložky. Přechod mezi routami řeší `AppShell`, stránka ho nepřidává. Změna textu, obnovení dat ani poloha scrollu se neanimují.
- Při `prefers-reduced-motion: reduce` pohyb odpadne nebo se zkrátí na prolnutí.

## 6. Komponenty

Kanonický inventář jsou složky `frontend-v2/src/components/ui/` (primitiva, shadcn + cva přestylovaná na tokeny) a `frontend-v2/src/components/shared/` (kompozity nad primitivy). Rám aplikace je v `components/layout/`. Než vznikne nová komponenta, projdi tyto složky. Duplikát existující komponenty je nález v review. Seznam souborů se sem ručně nepíše, zdrojem je kód.

| Komponenta | Kde | Kdy a jak | Stav |
|---|---|---|---|
| `Button` | `ui/` | Každá akce. `variant` `primary` (výchozí), `secondary`, `ghost`, `danger`. `size` `default` a `sm` (48 px, `sm` s menším odsazením), `lg` = hlavní akce obrazovky 56 px a plně kulatá, `icon` = 48 × 48 px s ikonou 20 px a povinným `aria-label`. `disabled`, `pending` (spinner, `aria-busy`, nejde stisknout znovu), `asChild` pro odkaz se vzhledem tlačítka. `default` a `outline` jsou zastaralé aliasy, nový kód je nepíše. | existuje (#452) |
| `Input` | `ui/` | Pole formuláře, výška 48 px. `invalid` nastaví `aria-invalid` a červený rámeček, text chyby je pod polem a propojí se přes `aria-describedby`. | existuje (#452) |
| `DropdownMenu` | `ui/` | Kebab menu akcí nad položkou, ovladatelné klávesnicí i dotykem: `DropdownMenuTrigger asChild` s `Button variant="ghost" size="icon"`, `DropdownMenuItem` (48 px, `variant="danger"` pro Smazat), `DropdownMenuSeparator` (Smazat oddělit od ostatních akcí). Menu je papírová karta nad modálem. | existuje (#452) |
| `Dialog` | `ui/` | Jen základ pro `Modal`. Obrazovky ho přímo nepoužívají. | existuje |
| `Modal` | `shared/` | Každý dialog a krátký formulář. API `isOpen`, `onClose`, `title`, `children`, `footer`, `maxWidth`, `persistent`. Do 640 px bottom sheet. | API existuje, postavení na `ui/dialog` **Cíl** #453 |
| `ConfirmDialog`, `PromptDialog` | `shared/` | Potvrzení mazání, opsání slova. Nikdy `window.confirm()` / `window.prompt()`. | existují, staví na `Modal` |
| `PageHeader` | `shared/` | Hlavička každé stránky (viz vzor Hlavička). `title` (vždy jediné `h1`), `subtitle`, `backTo` (cesta pro odkaz „Zpět“ nad titulkem), `primaryAction` (jedna akce: `label`, `icon`, a `onClick` nebo `to`), `secondaryActions` (`label`, `icon`, `onSelect`, `variant="danger"`, `disabled`) v kebab menu „Další akce“. Mazání menu samo oddělí od ostatních akcí. | existuje (#454) |
| `EmptyState` | `shared/` | Prázdná sekce: `icon` (lucide, vykreslí se 24 px), `message` (jedna věta), volitelná `action` (stejný tvar jako `primaryAction`, primární tlačítko). | existuje (#454) |
| `Card` | `shared/` | Papírová karta `bg-sheet` + `border-rule-soft` + `shadow-lift`, `rounded-2xl`, uvnitř `p-4 md:p-6`. `as` (`div`, `section`, `article`, `li`), `flush` bez vnitřního odsazení pro kartu se seznamem `ListRow`. | existuje (#454) |
| `ListRow` | `shared/` | Řádek seznamu, výška aspoň 48 px, `children` = obsah, `action` = slot vpravo (kebab menu nebo jedna ikona lehké položky). `as="li"` uvnitř `<ul>`. Odsazení `px-4 md:px-6` sedí s `Card`, oddělovače dá rodič (`divide-y divide-rule-soft`). | existuje (#454) |
| `FeatureErrorFallback` | `shared/` | Selhání načtení sekce, s tlačítkem znovu. | existuje |
| `TwoColumnLayout` | `layout/` | Hlavní sloupec + boční panel na desktopu. Master-detail seznamy jsou výjimka. | existuje |
| Skeletony | `RouteTransitionSkeleton`, `*Skeleton` ve featurách, třídy `.skeleton-*` | Načítání obsahu ve tvaru výsledného rozvržení. | existují |
| Toast | `lib/toast.ts` (`showToast`) | Výsledek akce. Chyby mutací přes `lib/mutationError.ts`. | existuje |

- **Zmrazené legacy třídy:** `.btn` a `.btn-*` (guard `legacyButton`, #452), `page-card`, `glass-card`, `admin-card` a `.card` (guard `legacyCard`, #454), `*-empty-*` (guard `legacyEmptyState`, #454). Nové použití selže v guardu, stávající jsou v allowlistu.
- **Primitiva v `ui/`** jsou jen `Button`, `Input`, `DropdownMenu`, `Dialog` a `Badge` (zatím bez použití, drží ho `themeBridge.test.tsx`). Ostatní nepoužitá shadcn primitiva #452 smazal. Nové primitivum se přidá až s prvním použitím, rovnou na tokenech.
- Surové `<button className=…>` pro akci a surové `<input>` se po #452 nepíšou, místo nich `Button` a `Input`.

## 7. Vzory

### Rozložení stránky

- Stránka se vykreslí v `<main id="page-container">` z `AppShell`. Shell drží místo pro `MobileHeader` a `MobileNav` (výška `--mobile-nav-height`) a na desktopu šířku a odsazení obsahu. Obal stránky je `p-3 md:p-0`. Spodní odsazení pro navigaci (`pb-20`) se nepřidává.
- Mezery mezi kartami `gap-4 md:gap-6`, uvnitř karty `p-4 md:p-6`. Obsah se nedotýká okrajů karty. Karta v kartě má `rounded-xl`.
- Dotykové cíle ≥ 48 × 48 px (`--touch-target-min`) s rozestupem 8 px (`--touch-target-gap`), hlavní akce obrazovky 56 px (`--touch-target-primary`).

### Hlavička (rozhodnutí #262)

- Každá stránka má jednu hlavičku `PageHeader` a **právě jedno `h1`**, a to titulek stránky.
- Volitelně odkaz „Zpět“ (`backTo`) nad titulkem a podtitulek (`subtitle`) pod ním.
- Vpravo **nejvýš jedna primární akce**. Další akce stránky jsou v kebab menu hlavičky.
- Stránka bez viditelného titulku (desktopový Přehled) má `h1` s `sr-only`.

### Vytvoření (rozhodnutí #262)

- **Primární akce v `PageHeader`:** `Button` primary s ikonou `Plus` a textem „Nová rezervace“, „Nové album“, „Nový seznam“. Text je vidět i na mobilu.
- **Rychlé přidání inline** v seznamu pro drobné opakované položky (položka nákupního seznamu, karta v kanban sloupci). Pole s tlačítkem přímo v seznamu, bez dialogu.
- Plovoucí tlačítko (FAB) pro vytváření se nepoužívá. „+“ se nepíše jako znak v textu tlačítka, plus je ikona.

### Akce nad položkou (rozhodnutí #262)

- Úpravy a mazání položky jsou v **kebab menu** (`DropdownMenu` s ikonou `EllipsisVertical`): Upravit, Smazat.
- Akce musí být vidět bez najetí myší. Akce, která se objeví jen při hoveru, na dotyku neexistuje.
- Přímo viditelná ikona je povolená jen pro nejčastější akci lehké položky (odškrtnout nebo odebrat položku nákupního seznamu). Má cíl 48 px a `aria-label`.

### Mazání (rozhodnutí #262)

| Co se maže | Jak |
|---|---|
| Lehká položka (položka nákupního seznamu) | hned, bez potvrzení |
| Všechno ostatní | `ConfirmDialog` s `danger`, potvrzovací tlačítko pojmenuje akci („Smazat“) |
| Hromadné nevratné mazání | `PromptDialog`, uživatel opíše potvrzovací slovo |

Mazání s potvrzením se neprovádí optimisticky, položka zmizí, až server potvrdí. Lehká položka smí zmizet hned (optimisticky s rollbackem).

### Formuláře

- Krátký formulář (zhruba do 5 polí) je v `Modal`, na mobilu jako bottom sheet. Delší formulář má vlastní stránku. Jedinou výjimkou je `ProfileDrawer` (navigační šuplík).
- Popisek nad polem bez dvojtečky. Nepovinné pole má v popisku „(nepovinné)“. Počítadlo znaků jen u pole s limitem.
- Chyba validace se ukáže pod polem, které ji způsobilo, s `aria-invalid`. Toast pro chybu pole se nepoužívá.
- Tlačítka v patičce: primární akce vpravo, „Zrušit“ vedle ní jako sekundární.

### Stavy

Každá obrazovka s daty řeší čtyři stavy:

| Stav | Řešení |
|---|---|
| Načítání | skeleton ve tvaru výsledku. Spinner jen v tlačítku během odesílání |
| Prázdno | `EmptyState`: „Zatím tu nejsou žádná alba.“ + akce „Nové album“ |
| Selhání načtení sekce | `FeatureErrorFallback` s tlačítkem znovu, zbytek stránky funguje |
| Data | obsah |

- Toast jen potvrzuje výsledek akce („Rezervace uložena.“). Chyby pole patří k poli.
- Offline a zastaralá data appka přizná a ukáže, odkdy jsou. Co čeká na odeslání, má viditelný stav „Čeká na odeslání“.

## 8. Hlas textů

- **Tykání všude**, i v hláškách z backendu, které se dostanou do UI (#457). Česky, s diakritikou, aktivní hlas.
- **Akce infinitivem:** „Uložit“, „Smazat“, „Zrušit“. **Vytvoření:** „Nový / Nová / Nové X“. **Průběh v první osobě:** „Ukládám…“, „Mažu…“.
- **Toast** je věta v příčestí s tečkou: „Rezervace uložena.“ Vykřičník se nepíše.
- **Chyba** říká, co se stalo a co dělat: „Rezervaci se nepodařilo uložit. Zkus to znovu.“ Neomlouvá se.
- **Prázdný stav:** „Zatím tu nejsou žádná X.“ + akce.
- Velké písmeno jen na začátku věty (i v nadpisech a tlačítkách). Výpustka je znak „…“, ne tři tečky.
- Pojmenování podle uživatele, ne systému („Předávka“, ne „checkout record“). Jeden název akce skrz celý tok („Předat chatu“ → „Chata předána“).
- **Emoji** jen v reakcích chatu, avatarech a textech pro WhatsApp. **Humor** jen ve vtipných hláškách `FeatureErrorFallback`.

## 9. Formáty

Jediný jazyk je čeština (`cs-CZ`). Formátuje jeden modul na `Intl`, **`frontend-v2/src/lib/format.ts`** (#455). `lib/dateUtils.ts` a `formatDate` z `lib/utils.ts` na něj delegují, lokální formátovače ve featurách převede #456. `date-fns` zůstává jen pro aritmetiku dat, ne pro zobrazení.

| Co | Tvar | Funkce |
|---|---|---|
| Plné datum | 21. 3. 2026 | `formatDate` |
| Krátké datum | 21. 3. | `formatShortDate` |
| Datum se dnem | po 21. 3. | `formatDayDate` |
| Datum s názvem měsíce | 10. prosince, čtvrtek 10. prosince | `formatLongDate` |
| Rozsah v měsíci / přes měsíc / přes rok | 12.–14. 7. / 30. 6. – 2. 7. / 30. 12. 2026 – 2. 1. 2027 | `formatDateRange` (`year: true` přidá rok vždy) |
| Čas, 24 h | 9:40, půlnoc 0:00 | `formatTime` |
| Částka | 1 234 Kč, celé koruny | `formatAmount` |
| Procenta | 12 % (vstup je hodnota v procentech) | `formatPercent` |
| Názvy měsíců a dnů | březen / března, po / pondělí | `monthName`, `weekdayName` |

- Rozsah píše pomlčku „–“ podle české typografie: bez mezer mezi jednoslovnými částmi („12.–14. 7.“), s mezerami mezi víceslovnými („30. 6. – 2. 7.“, tak to už ukazují pobyty, rezervace i přehled). Přes přelom roku má rok u obou dnů, jinak by z rozsahu nebyl poznat.
- Kalendářní den se předává jako `"YYYY-MM-DD"` a zobrazí se přesně tak. `Date`, číslo nebo ISO razítko s časem je okamžik a zobrazí se v pražském čase (`Europe/Prague`) bez ohledu na zónu zařízení.
- `Intl` dává u částek a procent nezlomitelnou mezeru (` `). Testy s ní musí počítat.
- `toLocale*String`, `Intl.DateTimeFormat`/`NumberFormat` a lokální pole s názvy měsíců mimo modul hlídá guard `localFormatter`.

## 10. Vymáhání a allowlist

Co jde ověřit strojově, hlídají guard testy ve `frontend-v2/src/test/`. Skenují zdrojáky přes `import.meta.glob` s `?raw` a běží v `npm test`, preflightu i CI. Zbytek posuzuje `/code-review` podle tohoto dokumentu (odkaz z `CODING_STANDARDS.md`).

**Dnešní guardy:** `uiIconography` (emoji a dingbaty jako ikony), `noEmeraldTeal`, `noLeftStripes`, `lightSurfaces` (plné karty, sklo jen jako akcent), `textAndTouchTokens` (16/14 px, 48/56 px), `mutedTextContrast`, `statusBadgeContrast`, `brandGreen` (kontrast značkové zelené), `themeBridge` (most shadcn).

**Guard `designRules.test.ts`** (pravidla v `designRules.ts`, výjimky v `designAllowlist.json`, #450). Soubory s definicí tokenů (`styles/variables.css`, `styles/shadcn-tokens.css`) jsou mimo rozsah prvních tří pravidel.

| Pravidlo | Co selže |
|---|---|
| `rawColour` | surový hex nebo `rgb()`/`rgba()` s čísly, i jako fallback `var(--x, #hex)` |
| `rawPalette` | `--raw-*` |
| `legacyColorAlias` | deprecated `--color-*` |
| `coldPalette` | `slate-*`, `emerald-*`, `bg-white` (v `className` hlídá i ESLint, výjimky bere ze stejného allowlistu) |
| `breakpoint` | media query mimo 768/1024 px (viz kapitola 2), Tailwind `sm:`, `xl:`, `2xl:`, `min-[…]:`, `max-[…]:` |
| `newCssFile` | každý `.css` pod `src/` kromě `index.css` a souborů s definicí tokenů |
| `localFormatter` | `toLocale*String`, `Intl.DateTimeFormat`/`NumberFormat` nebo český název měsíce jako řetězec v TS/TSX mimo `lib/format.ts` (kapitola 9) |
| `fontWeight` | řez mimo načtené 400/500/600/700 (`font-weight: 800`, `font-extrabold`, `font-black`, `font-light` …) |
| `diaryFont` | Kalam (`--font-diary`) mimo `styles/diary.css` |
| `inlineSvg` | inline `<svg>` v TSX |
| `iconSize` | ikona lucide jinak než 16/20/24 px (`size={…}`, `h-*`/`w-*`/`size-*`) |
| `legacyButton` | třída `btn` nebo `btn-*` v TS/TSX (zmrazený legacy systém tlačítek, místo něj `Button`) |
| `legacyCard` | třída `page-card`, `glass-card`, `admin-card` v TS/TSX, holé `card` v `className`, `cn()`/`clsx()` nebo selektoru (místo nich `Card`) |
| `legacyEmptyState` | třída `<něco>-empty-<něco>` v TS/TSX (místo ní `EmptyState`) |

ESLint `no-restricted-imports` pouští jako ikonovou sadu jen `lucide-react`.

**Přibude:** vykání v hláškách backendu (node:test, #457).

Pravidla allowlistu (pomocník `designGuard.ts`, stávající guardy na něj převede #459):

- Stávající porušení jsou v jednom allowlistu **soubor → důvod**, v JSON seskupené `pravidlo → důvod → soubory`. Položka bez důvodu nebo soubor uvedený u pravidla dvakrát selže.
- Guard selže na nový výskyt i na položku allowlistu, která už je čistá. Allowlist se tak smí jen **zmenšovat**.
- Přidat položku jde jen v PR, které ji výslovně zdůvodní (např. nový soubor třetí strany). Review takové PR posuzuje zvlášť.
- Výstup guardu ukazuje počet zbývajících výjimek u každého pravidla. Prázdný allowlist znamená, že „Krok 6 design systém“ v #69 je hotový.
- **Jak allowlist zmenšit:** převeď soubor tak, aby pravidlo neporušoval, a smaž ho ze seznamu u daného pravidla (prázdnou skupinu i s důvodem). Výjimka platí pro celý soubor: dokud v něm zbývá jediný výskyt, položka zůstává, a jakmile je čistý, guard sám vyžádá její smazání. Seznam porušení ukáže dočasné odebrání souboru z allowlistu a `npx vitest run src/test/designRules.test.ts`.
- **Nové pravidlo:** objekt `DesignRule` (jméno, nápověda, `scope`, regex nebo funkce `match`) v `designRules.ts`, příklady do `designRules.test.ts` a stávající porušení pod jeho jménem do `designAllowlist.json`.

## 11. Postup převodu obrazovky

1. Jedna obrazovka = jeden ticket = jeden PR do ~400 řádků. Začíná se rezervacemi (#460–#462). Redesign ticket se nebere, dokud nejsou zavřené jeho blokery (kanonické komponenty a guardy).
2. Najdi soubory obrazovky v allowlistu. To je seznam toho, co převést.
3. Hlavičku nahraď `PageHeader`, akce `Button` a kebab menu, karty `Card`, řádky `ListRow`, prázdné stavy `EmptyState`. Barvy, mezery a písmo převeď na tokeny a typovou škálu, texty a formáty podle kapitol 8 a 9.
4. Odeber převedené soubory z allowlistu. Guard sám selže, když v něm zůstane čistý soubor.
5. Stávající testy obrazovky projdou beze změny. Nový seam se pro převod nezavádí.
6. Zkontroluj obrazovku na 360 px a na desktopu (skill `verify`, screenshoty) a projdi ji agentem `ux-reviewer` (#449).
7. Akceptační kritérium PR: „odpovídá `DESIGN.md`, soubory odebrány z allowlistu“.

Změna tohoto dokumentu jde přes PR s důvodem. Nová barva, písmo nebo vizuální směr je rozhodnutí uživatele, ne agenta.
