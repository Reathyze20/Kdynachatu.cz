# Redesign – Fáze 4: Pravidla FE/UX (závazný filtr návrhů)

Stav k **2026-11-21** · Shodnuto (agent předložil research + návrh, uživatel schválil všechna
pravidla a u ⭐ voleb vybral doporučené varianty). První část Fáze 4 procesu z
[redesign-proces.md](redesign-proces.md) – *vizuální směr a technická rozhodnutí*. Druhá část
Fáze 4 = **návrhy obrazovek** (Akcion styl, varianty A/B/C), které tenhle filtr dodržují.

Pravidla **revidují** existující design kontrakt `.agents/skills/CabinSaaS_Architect/SKILL.md`
(Fáze 4 reviduje, nezahazuje). Kde se liší, platí tento dokument a kontrakt se podle něj později
upraví.

## Z čeho to vychází

Research 2026/2027 se sešel na posunu **od „vizuální show" ke klidu a funkčnosti**: *calm*
rozhraní, míň rozhodnutí na obrazovku, pohyb který *vysvětluje* místo aby předváděl, hloubka a
efekty jen když zlepší čitelnost. To sedí na vizi „krmit, ne nahrazovat" a „appka drží klidnou
pravdu". Proti tomu stál kontrakt „floating glass in a forest" (glassmorphism, fotka lesa na
pozadí) z doby, kdy byl glassmorphism v módě — proto tři revize níže (C4, C5, H1).

---

## Pravidla

### A — Postoj a nálada
- **A1 · Klid místo show.** Míň prvků, jasná hierarchie, hodně vzduchu. Appka nesnižuje zátěž tím, že na sebe upozorňuje.
- **A2 · Osobnost, ne generická SaaS šeď.** Charakter (barvy lesa, teplo, konkrétní chata), nikdy šablona.
- **A3 · Výchozí volby, co fungují bez nastavování.** Co jde, předvyplnit; konfigurace až na vyžádání.

### B — Mobile-first a palec
- **B1 · Navrhujeme pro palec.** Hlavní akce v dosahu palce, dolní navigace zůstává.
- **B2 · Dotykové cíle ≥ 48 px** s rozestupem ≥ 8 px, hlavní tlačítko 56 px. *(Revize 2026-11-22: dřív 44 px. Rodina používá jen Android a Material počítá se 48 dp.)*
- **B3 · Respektujeme gesta systému** — nenutit do „jen klikání".

### C — Vizuální jazyk
- **C1 · Design tokens jako jediný zdroj pravdy** (Tailwind 4 `@theme` + CSS proměnné), ne natvrdo v komponentách. Staví na existujícím `variables.css`.
- **C2 · Paleta „Moderní Les": emerald (akce) + slate (neutrál)** + stavové barvy. Žádné divoké palety.
- **C3 · Typografie nese osobnost** — charakterní nadpisový řez + čitelný řez na text.
- **C4 ⭐ → (a) Zmírnit sklo.** Frosted glass jen jako jemný akcent (modály, horní lišta); obsah na čistých kartách. Hloubka slouží čitelnosti, ne efektu.
- **C5 ⭐ → (a) Lehké pozadí.** Jemný gradient/textura v barvách lesa; fotka lesa jen na přihlášení a prázdných stavech (ne fullscreen všude — kvůli 3G výkonu a kontrastu textu).

### D — Pohyb a zpětná vazba
- **D1 · Pohyb vysvětluje, nepředvádí.** Ukazuje co se stalo (uloženo → odesláno), krátce (0,15–0,3 s), easeOut.
- **D2 · Mikrointerakce na každou akci** — tlačítko reaguje, checkbox potvrdí, skeleton místo prázdna. Tohle dělá rozdíl „appka vs. prototyp".
- **D3 · Optimistické akce u častých věcí** (odškrtnutí, rychlé přidání), rollback při chybě. U mazání a uploadů ne.

### E — Stavy obrazovky
- **E1 · Každá obrazovka řeší čtyři stavy:** načítání (skeleton) · chyba (se „zkusit znovu") · prázdno · data. Nikdy prázdná bílá.
- **E2 · Prázdný stav = pozvánka k akci**, lidsky, česky, s jedním tlačítkem.
- **E3 · Spolehlivý dnešek.** Přehled nikdy neukáže úkol, který se mě netýká, a jednu výzvu ukáže jen jednou (ne karta + banner + upomínka se stejným textem). Nespolehlivý „dnešek“ ničí důvěru v celou appku. *(Nové 2026-11-22.)*
- **E4 · Čerstvost dat.** Když je appka offline nebo jsou údaje staré, řekne to a ukáže, odkdy jsou. Co čeká na odeslání (např. předávka bez signálu), má viditelný stav „Čeká na odeslání“. *(Nové 2026-11-22.)*

### F — Texty
- **F1 · Pojmenování podle uživatele, ne systému** („Předávka", ne „checkout record").
- **F2 · Aktivní hlas, sentence case, jeden název akce skrz celý tok** („Předat chatu" → „Chata předána").
- **F3 · Chyby se neomlouvají — říkají co a jak dál.**

### G — Přístupnost jako základ
- **G1 · Kontrast textu ≥ 4,5:1**, UI prvky ≥ 3:1 (přímo rozhoduje o C4/C5).
- **G2 · Viditelný focus, ovládání z klávesnice, `reduced motion`** od začátku.
- **G3 · Běžný text 16 px, nic menšího než 14 px.** Funguje i se zvětšeným písmem v telefonu, nic se neusekne (WCAG 1.4.4). *(Revize 2026-11-22: dřív jen minimum 14 px.)*
- **G4 · Barva člena nikdy sama.** Vždy s iniciálou nebo avatarem a se jménem v textu (WCAG 1.4.1). Barvy členů jsou z ověřené palety: bílý text na barvě ≥ 4,5:1, rozlišitelné i při barvosleposti. *(Nové 2026-11-22.)*

### H — Signature: „dýchat tvou chatou"
- **H1 ⭐ → (a) Umírněně.** Appka zná jméno a jednu fotku chaty (hero na dashboardu, přihlášení), jinak zůstává klidná a čitelná. Osobnost v detailech, ne v chaosu.

---

## Jak se pravidla používají v návrzích

Každá varianta obrazovky (A/B/C) musí projít tímhle filtrem; verdikt „A je nejjednodušší a
doporučená" z Akcion stylu se řídí hlavně A1 (klid) + E/G (stavy, přístupnost). Rozhodnutí C4a,
C5a, H1a jsou **pevná** napříč všemi obrazovkami — varianty se v nich neliší.

---

## Revize 2026-11-22 (podle průzkumu domovské obrazovky)

Externí UX/UI průzkum domovské obrazovky pro sdílenou chatu (22. 11. 2026) agent porovnal s
pravidly a odsouhlasenými návrhy a uživatel schválil všech šest navržených změn:

1. **E3 Spolehlivý dnešek** (nové). Nejsilnější varování průzkumu jsou stížnosti hostitelů na
   Airbnb Today, které ukazovalo zastaralé nebo nesouvisející údaje. U nás je to #255 (upomínka
   odjezdu se ukazuje i tomu, kdo neodjíždí) a trojí výzva k odjezdu na dnešním Přehledu.
2. **B2** 44 → 48 px, hlavní tlačítko 56 px.
3. **G3** běžný text 16 px.
4. **G4 Barva člena nikdy sama** (nové). Dnešní paleta `SWATCH_COLORS` (14 barev) z poloviny
   nesplní 4,5:1 s bílým textem a při deuteranopii jsou některé dvojice skoro stejné (spočítáno
   2026-11-22, ΔE 0,9 šalvějová × růžová).
5. **E4 Čerstvost dat** (nové).
6. **Volno přímo v toku času** na Přehledu: obsahové rozhodnutí, řeší se v návrhu #6.

Zamítnuto z průzkumu: pás obsazenosti na 8–12 týdnů na Přehledu (patří do Kalendáře, odporuje
rozhodnutí #1), nová paleta „Teplý papír / Severská chalupa“ (C2 platí; teplejší pozadí je jen
volba v pickeru #6), automatická výměna písma (Atkinson Hyperlegible Next je jen varianta v #6).

Vedlejší nález: stavové štítky v mockách (barva textu na 16% podbarvení) mají kontrast jen
3,6–4,0:1 a **nesplňují G1**. Tmavší odstíny `--ok 47 107 82`, `--low 138 75 6`,
`--empty 180 35 35` dávají 4,8–5,3:1 (použito v návrhu #6). Ověřit i v kódu aplikace.

