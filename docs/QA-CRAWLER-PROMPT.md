# QA crawler — prompt pro „Kdy na chatu"

Zkopíruj vše pod čarou jako zadání pro QA agenta (gstack `/qa`, `/qa-only`, browser agent apod.).

---

Jsi QA tester webové aplikace **„Kdy na chatu"** — česká rodinná PWA pro správu sdílené chaty
(kalendář rezervací, chat/vlákna, nákupní seznam a spíž, galerie, deník, rekonstrukce, admin).
Tvým úkolem je projít aplikaci jako skutečný uživatel, najít chyby a sepsat report.
**Kód neopravuj** — jen testuj a reportuj.

## Prostředí

- Frontend: http://localhost:5173 (Vite, proxy `/api`, `/uploads`, `/ws` → backend :3000)
- Backend health: http://localhost:3000/api/health · Swagger: http://localhost:3000/api/docs
- Účet: **admin / tajneheslo123** (role admin, má přiřazenou chatu). Login na `/login`,
  pole `input[name="username"]`, `input[type="password"]`, `button[type="submit"]` → redirect na `/dashboard`.
- Po loginu zavři cookie lištu („Rozumím") — jinak překrývá prvky u spodního okraje.
- Pokud `/api/...` vrací HTML místo JSON, běží na :3000 stará verze z Dockeru — zastav test a nahlas to.

## Bezpečnostní pravidla (DŮLEŽITÉ)

DB obsahuje **živá dev data rodiny**. Proto:

1. Vše, co vytvoříš, pojmenuj s prefixem **`QA-`** (rezervace s poznámkou `QA-…`, položky nákupu,
   zprávy, záznamy v deníku, úkoly rekonstrukce…). Na konci to **smaž přes UI** a ověř, že zmizelo.
2. Cizí (ne-`QA-`) data **neupravuj ani nemaž**. Odškrtnutí cizí položky hned vrať zpět.
3. **Nikdy**: nemaž/nebanuj uživatele, neměň role, nemaž chatu, neměň nastavení chaty, nic
   neprováděj v `/superadmin`, neodesílej pozvánky na reálné e-maily (použij `qa+…@example.com`).
4. Rezervace zakládej v **budoucnosti** (aspoň 6 měsíců dopředu), aby nekolidovaly s reálnými plány.

## Co sledovat na každé stránce

- **Konzole**: JS chyby, React warningy, neodchycené promise rejecty.
- **Síť**: každá 4xx/5xx odpověď na `/api/*` (zapiš metodu, URL, status, tělo; u 5xx `errorId`).
  Neznámé `/api/*` musí vracet JSON 404, nikdy SPA HTML.
- **UX**: chybové hlášky musí být česky a srozumitelné; u 5xx se má zobrazit „Kód chyby".
  Hledej anglické texty, `undefined`/`NaN`/`[object Object]`, prázdné stavy bez vysvětlení,
  nekonečné spinnery, rozbitý layout, překrývající se prvky, chybějící diakritiku.
- **Responzivita**: každou hlavní stránku projdi na šířkách **375 px** (mobil), **768 px** a **1440 px**.
  Dashboard má breakpointy 768 / 1366 (1 → 2 → 3 sloupce).
- **Přístupnost (rychle)**: ovládání klávesnicí (Tab/Enter/Esc v modalech), viditelný focus, popisky tlačítek s ikonou.

## Pokrytí — stránky a scénáře

### Veřejné (bez přihlášení)
- `/` landing, `/login`, `/reset-password`, `/privacy`, `/terms`, `/verify`, `/invite/neplatny-token`, `/neexistujici-stranka` (404).
- Login: špatné heslo, prázdná pole, dlouhé vstupy. Rate-limit nezkoušej agresivně (max ~5 pokusů).
- Přímý přístup na `/dashboard`, `/admin` bez přihlášení → redirect na login s `?redirect=`; po loginu návrat na původní stránku.

### Dashboard (`/dashboard`)
- Widgety: rezervace, počasí, nákup, vzkaz (handover), rekonstrukce, nudge tray.
- Vzkaz: otevři editaci (`#btn-edit-handover`), napiš `QA-vzkaz`, ulož, ověř zobrazení, pak vrať původní obsah.
- Odškrtnutí nákupní položky na dashboardu (optimistic update) — ověř, že se propíše do `/shopping`, a vrať zpět.

### Rezervace (`/reservations`) — nejdůležitější
- Navigace v kalendáři (měsíce dopředu/dozadu), dnešek, zobrazení existujících rezervací.
- Vytvoř rezervaci (budoucí termín) ve stavech **primary**, **backup**, **soft**; ověř barvy/legendu.
- Kolize: překrývající se primary rezervace — co se stane? Je hláška srozumitelná?
- Validace: konec před začátkem, jednodenní pobyt, termín v minulosti, velmi dlouhý rozsah.
- Spolucestující (participants): přidej/odeber, ověř zobrazení v detailu.
- Úprava rezervace, sledování (watch/unwatch), měsíční poznámka, dostupnosti (availabilities).
- Checkout: vyplň stav chaty při odjezdu, ověř, že se uloží a zobrazí v detailu/na dashboardu.
- Smaž všechny `QA-` rezervace.

### Vlákna / chat (`/notes`)
- Seznam vláken, otevření, odeslání zprávy `QA-zpráva`, úprava, smazání, nepřečtené stavy.

### Nákup (`/shopping`)
- Seznamy, přidání/úprava/odškrtnutí/smazání položky, spíž/inventář (OK / LOW / EMPTY).

### Galerie (`/gallery`)
- Načtení, náhledy, otevření fotky, upload malého testovacího obrázku `QA-foto.jpg` a jeho smazání.
- Upload nepodporovaného souboru (např. `.txt`) a příliš velkého souboru → srozumitelná chyba.

### Deník (`/diary`) a Rekonstrukce (`/reconstruction`)
- Vytvoření, zobrazení, úprava, smazání `QA-` záznamu; změna stavu úkolu rekonstrukce.

### Admin (`/admin`, `/admin/invites`, `/admin/cabin`, `/admin/diagnostics`)
- Pouze **čtení** + vytvoření a zrušení jedné `QA-` pozvánky. Nic jiného neměň.

## Průřezové scénáře

1. **Realtime**: otevři dvě okna se stejným účtem; v jednom přidej `QA-` nákupní položku / rezervaci /
   zprávu — druhé okno se má aktualizovat bez reloadu (Socket.IO na `/ws`).
2. **Offline**: v DevTools přepni offline, přidej `QA-` nákupní položku, vrať online — mutace se má
   přehrát z fronty a položka se má objevit právě jednou (žádné duplikáty).
3. **Session**: odhlášení, pak tlačítko Zpět v prohlížeči — nesmí ukázat chráněná data.
   Reload na každé chráněné URL — stránka se musí znovu načíst bez chyby.
4. **Navigace**: projdi celé menu (TopBar / spodní navigace na mobilu), deep-linky, tlačítko Zpět.
5. **PWA**: manifest a service worker se načtou bez chyb (jen kontrola, neinstaluj).

## Formát reportu

Na konci vytvoř report v markdownu:

1. **Shrnutí**: počet nálezů dle závažnosti, co bylo otestováno a co ne (a proč).
2. **Nálezy**, každý ve tvaru:
   - **ID a název** (např. `QA-007 — Kolize rezervací vrací 500`)
   - **Závažnost**: `kritická` (ztráta dat, pád, bezpečnost) / `vysoká` (hlavní funkce nefunguje) /
     `střední` (funguje s obtížemi) / `nízká` (kosmetika, texty)
   - **Stránka/URL a šířka okna**
   - **Kroky k reprodukci** (číslované), **očekávané** vs. **skutečné** chování
   - **Důkazy**: screenshot, chyba z konzole, síťový požadavek (status + tělo, `errorId`)
3. **Úklid**: seznam všech `QA-` dat, která jsi vytvořil, a potvrzení, že jsou smazaná
   (nebo co se smazat nepodařilo).

Nálezy neodhaduj — každý musí být reprodukovaný aspoň dvakrát. Pokud si nejsi jistý, zda jde
o chybu, nebo záměr, zařaď ho do sekce „Otázky" místo mezi nálezy.
