# Redesign „Kdy na chatu" – proces analýzy a brainstormingu

Stav k **2026-11-20**. Tento dokument popisuje **jak budeme pracovat** na posunu aplikace
na skutečně production-ready produkt. Není to plán produktu – je to kostra procesu, který ten
plán teprve vyrobí. Zítra navazujeme Fází 1.

---

## Dělba práce

Celý proces stojí na tom, kdo co umí. Pravidlo: **uživatel nikdy nedělá analýzu ani
neprogramuje – reaguje, rozhoduje a testuje. Agent vždy předloží hotový návrh, ke kterému
stačí říct ano/ne.**

| Co nese uživatel (silná stránka) | Co nese agent (a subagenti) |
| --- | --- |
| Vidí to očima zákazníka, pozná dobrý pocit | Analytický rozklad: z „pocitu" udělá seznam funkcí a důvodů |
| Má nápad / vizi, ví kam to má směřovat | Technická proveditelnost, architektura, kód |
| Umí testovat a chytit, co nefunguje | Struktura a dokumentace, aby se uživatel neztratil |
| Rozhodne „ano/ne, takhle to chci" | Připraví rozhodnutí tak, že stačí ano/ne |

---

## Na čem stavíme (nejdeme od nuly)

Redesign **není greenfield**. Tři existující vstupy náš proces bere a **prověřuje** je
(potvrdit co platí, přepsat co neplatí), ne zahazuje:

- **Produktová vize** – `docs/PRODUCT.md` (co produkt je, non-goals, segmenty).
- **Roadmapa** – map issue #69 (8 kroků, mj. „Krok 6 – design systém + redesign, mobil první").
- **Designový kontrakt** – `.agents/skills/CabinSaaS_Architect/SKILL.md` (tokeny „Moderní Les",
  shadcn/ui, estetika „floating glass in a forest").

Fáze 1 (vize) a Fáze 4 (design) proto nezačínají prázdné, ale revizí toho, co už je.

---

## Kostra procesu – 6 fází

Funnel od „proč a pro koho" dolů k „postaveno a otestováno". Každá fáze má hmatatelný
**výstup**, aby bylo vždy vidět, co z ní vypadlo.

| # | Fáze | Kdo vede | Výstup |
| --- | --- | --- | --- |
| 0 | **Kde dnes stojíme** | agent | Fotka současného stavu (viz příloha níže) |
| 1 | **Vize a zákazník** | uživatel (agent se ptá) | Vizní dokument + „úkoly uživatele" |
| 2 | **Co všechno by mohlo existovat** | agent (uživatel reaguje) | Seznam funkcí s odůvodněním |
| 3 | **Co doopravdy postavíme** | spolu | Priorizovaná roadmapa / rozsah |
| 4 | **Jak to bude vypadat a fungovat** | agent (uživatel schvaluje pocit) | Design + architektonická rozhodnutí |
| 5 | **Stavba** | automat (SDLC repa) | Hotový kód po kouskách |
| 6 | **Validace** | uživatel | Co projde / co se vrací do stavby |

**Fáze 1 – Vize a zákazník.** Pro koho to je, jaký problém to řeší, jaký je ten jeden hlavní
slib. Doména uživatele – tady přijde grilling.

**Fáze 2 – Co by mohlo existovat.** Analýza: podobné appky, katalog možných funkcí, u každé
důvod navázaný na úkol uživatele z Fáze 1. Uživatel u každé řekne dává/nedává smysl.

**Fáze 3 – Co postavíme.** Co je uvnitř a co ne, co znamená „production-ready" pro tuhle verzi.
Tady se nejvíc škrtá. Reconciliace s roadmapou #69.

**Fáze 4 – Jak to bude vypadat.** UX toky, uspořádání obrazovek, vizuální směr, technická
rozhodnutí. Revize existujícího design systému.

**Fáze 5 – Stavba.** Najíždí existující mašinérie repa: grilling → `/to-spec` → `/to-tickets`
→ `/implement` → `/code-review` (autopilot). Uživatel do toho nesahá.

**Fáze 6 – Validace.** Strukturované testování proti vizi z Fáze 1 – ne „klikl jsem a jede",
ale „dělá to, co jsme slíbili zákazníkovi?".

---

## Tempo

Jedeme **fázi po fázi** jako páteř (dokončit vizi, pak teprve funkce…). Když uživatele
napadne cokoli mimo pořadí, jen to řekne a agent to zařadí do správné fáze – **nic se
neztratí** (parkoviště nápadů).

## Jak držíme celek pohromadě

**Každé rozhodnutí se zapíše** – krátce, lidsky, i s důvodem – aby se k němu šlo kdykoli
vrátit („tohle jsme rozhodli tehdy a proto"). Pro drahá/nevratná rozhodnutí vzniká ADR
v `docs/adr/`. To je záchranná síť proti pocitu „nevím, co se děje".

---

## Příloha: Fáze 0 – fotka současného stavu (2026-11-20)

**Co aplikace je.** PWA pro sdílenou chatu střídanou víc domácnostmi (rotace, ne společné
pobyty). Drží strukturovanou pravdu, výstupy posílá do rodinného WhatsAppu přes „Kopírovat
pro WhatsApp" – WhatsApp nenahrazuje. Jádro: kalendář rezervací, předávka (těžiště),
zásoby/nákupy, nudge upozornění. Doplňky (neživit na úkor jádra): chat, galerie, deník,
rekonstrukce. Mobil první, jen čeština, žádné app store.

**Role.** Tenant = chata (`cabinId`). Role vázané na chatu: správce / člen / host. Plný
model členství User↔Cabin (ADR-0001) zatím neimplementován – dnes má User jediné nullable
`cabinId`.

**Tech stack.** Backend Express 4 + Prisma 7 + PostgreSQL (TypeScript přes tsx), Socket.IO,
23 rout, Zod validace, auth + cabinMiddleware (tenant scope jen ze serveru). Frontend
React 19 + Vite 7 + TanStack Query 5 + Tailwind 4 + shadcn/ui, React Router 7, 16 feature
složek, offline fronta. 29 Prisma migrací.

**Hosting.** Jeden VPS, PM2, deploy z GitHub Actions. Staging z každého pushe do `main`,
produkce jen z release tagu `v*` po schválení (ADR-0002).

**Stav / dluhy, které posouvají „production-ready" dál:**
- Rodina aktuálně aplikaci **nemá** – „Krok 3 rodina online" (#63) je rozpracovaný
  (`docs/plans/KROK-3-go-live-navod.md`).
- Nesplněná „Definition of Done" návratu (`PRODUCT.md`): e-mail, monitoring, off-site
  záloha, smoke test na telefonu.
- Chybí tenant-isolation testy a backend harness s reálnou DB (#64) – povinné dřív než
  členství (#67).
- Model členství + matice rolí host (ADR-0001) neúplný, nepokrytý testy.
- UI dluh: hybrid 28 legacy CSS + Tailwind + shadcn; duplicitní modal systémy; staré lint logy.
- `GLOSSARY.md` zatím neexistuje.

**Roadmapa (#69), ověřený stav:**

| Krok | Obsah | Stav |
| --- | --- | --- |
| #61 Krok 1 | Proces (skills, CLAUDE.md, SDLC) | ✅ hotovo |
| #62 Krok 2 | Necommitnutá práce → PR do main | ✅ hotovo |
| #63 Krok 3 | Rodina online (VPS, deploy, e-mail, monitoring, zálohy) | ⬜ |
| #64 Krok 4 | Backend harness + tenant-isolation testy | ⬜ |
| #65 Krok 5 | Koordinační vrstva (pobyt + seznam s sebou, web push) | ⬜ |
| #66 Krok 6 | Design systém + redesign, mobil první | ⬜ |
| #67 Krok 7 | Členství User↔Cabin, matice rolí, hosté (ADR-0001) | ⬜ |
| #68 Krok 8 | Komerční připravenost (jen po rozhodnutí 30. 6. 2027) | ⬜ |
