# Redesign – Fáze 5: Rozpad na implementační tickety

Stav k **2026-11-21**. Výstup grillingu Fáze 5 (Stavba). Navazuje na
[decision log Fáze 4](redesign-faze-4-rozhodnuti.md), [proces](redesign-proces.md) a mocky v
`docs/design/`. Zdroj pravdy pro akceptační kritéria = **decision log + mocky** (PR #163).

Fáze 5 = implementační část roadmapy **#66** (Krok 6 – design systém + redesign). Smí běžet
paralelně od Kroku 3, není blokovaná #64 ani #65 (ověřeno z #66/#69).

## Rozhodnutí o postupu (odsouhlaseno 2026-11-21)

- **Řez vertikálně po obrazovkách** — jeden balík = jedna obrazovka shora dolů (dluh → API/typy →
  UI). Po každém balíku je obrazovka hotová a testovatelná.
- **Pre-cleanup napřed** — obrazovka s legacy dluhem dostane nejdřív čistící PR (bez vizuální změny),
  pak UI PR. Obrazovky bez dluhu se staví rovnou.
- **Malé PR** — když UI nevejde do ~400 řádků, rozseknout na víc menších PR, ne jeden velký s
  `large-pr-ok` (ten stejně nasazuje jen člověk).
- **Žádný big-bang** — každý PR nechá celou appku funkční; dosud neredesignovaná obrazovka se nesmí
  rozbít. **Theme bridge (#0) je aditivní** — nesmí rozhodit vzhled stávajících legacy obrazovek.
- **Testy** — upravit jen tam, kde se chování záměrně změnilo, + přidat pokrytí pro nové chování;
  nikdy neoslabovat test jen pro zelenou. Pre-cleanup drží testy zelené pořád.
- **Tickety = sub-issues pod #66.** Samostatný `/to-spec` jen u backend-heavy (předávka, rezervace,
  zásoby); u čistě UI ticketů stačí odkaz na mock + log.
- **Gating pro autopilot** — `ready-for-agent` dostává vždy jen aktuálně odblokovaný ticket; další se
  povyšuje, až se mergne jeho předpoklad. Triage labely mění agent, merge dělá člověk.
- **Ikony/ilustrace** — Lucide pro UI, Midjourney jen na atmosféru. UI se staví s placeholder slotem,
  Midjourney assety se doplní jako drop-in (nečeká se na ně). Prompty viz níže.

## Pořadí ticketů (= závislosti)

| # | Ticket | Typ | Závisí na | Pozn. |
|---|--------|-----|-----------|-------|
| T0 | Theme bridge: `components.json` + `@theme` most `variables.css` ↔ Tailwind/shadcn | FE infra | — | aditivní, nerozbít legacy |
| T0b | Emoji → lucide úklid (28 výskytů / 19 souborů) | FE úklid | — | neblokující, paralelně |
| T1 | Navigace #0 + desktop rám #1b (globální shell) | UI | T0 | |
| T2 | Přehled #1 „stav chaty teď" | UI | T1 | placeholder hero + prázdný stav |
| D1 | **Design:** semantika plynu (Plný/Půl → v pořádku/dochází/došlo?) | mini-design | — | rozhodnout před T3/T4; dotýká se modelu |
| T3a | Předávka pre-cleanup: sjednotit dva toky, `departingToday` gate, terminologie `handoverNote` | backend | — | |
| T3b | Předávka #2 UI | UI | T1, D1, T3a | těžiště |
| T4 | Příjezd #3 UI (zrcadlo předávky, read-only) | UI | T1, D1, T3b | |
| T5a | Rezervace pre-cleanup: off-by-one datumy, dva datové toky, `DELETE /reservations/:id` | backend | — | |
| T5b | Rezervace + kalendář #4 UI | UI | T1, T5a | desktop pravý panel bohatší |
| D2 | **Design:** systém značek nákupní položky (ze zásob / z domova / ★ / kdo) | mini-design | — | rozhodnout před T6 |
| T6a | Zásoby pre-cleanup: mrtvý pantry, dva route soubory, mojibake, redundant `purchased`/`status` | backend | — | |
| T6b | Zásoby #5 UI | UI | T1, D2, T6a | desktop dva sloupce + přesun |

Pre-cleanup (T3a/T5a/T6a) a mini-design (D1/D2) nemají tvrdou závislost na shellu — dají se dělat
dřív/paralelně. UI tickety visí na shellu (T1) a na svém pre-cleanupu/designu.

## Assety (Midjourney)

Povinné: hero chaty, prázdný stav Přehledu, přihlášení. Bonus: obecné prázdné stavy sekcí.
Společná kotva stylu: *muted emerald & slate palette, soft diffused natural light, calm and homely,
understated, no people, no text, no logos.*

```
# 1 – Hero chaty (pruh na Přehledu)
cozy wooden Czech family cabin at the edge of a quiet pine and birch forest,
early morning light, thin mist between trees, muted emerald and slate palette,
soft diffused natural light, calm and homely, understated, cinematic photography,
shallow depth of field, no people, no text, no logos --ar 3:1 --style raw --v 7

# 2 – Prázdný stav Přehledu (pozvánka, ilustrace)
warm minimal illustration of an open cabin door with light spilling out,
surrounded by stylized pine forest, inviting and friendly, flat painterly style,
muted emerald and slate palette, soft light, calm, no people, no text --ar 4:3 --v 7

# 3 – Přihlášení (pozadí) – mobil
serene forest cabin at dusk, soft warm glow in the window, atmospheric,
clear calm space in the upper area for a login form, muted emerald and slate palette,
photographic, no people, no text, no logos --ar 9:16 --style raw --v 7

# 3b – Přihlášení (pozadí) – desktop (stejná scéna)
serene forest cabin at dusk, soft warm glow in the window, atmospheric,
clear calm space on one side for a login form, muted emerald and slate palette,
photographic, no people, no text, no logos --ar 16:9 --style raw --v 7

# 4 – Obecný prázdný stav sekcí (bonus, ilustrace)
simple friendly spot illustration, single pine tree and a small wooden crate,
lots of negative space, muted emerald and slate palette, flat style, calm,
no people, no text --ar 1:1 --v 7
```
