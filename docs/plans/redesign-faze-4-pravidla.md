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
- **B2 · Dotykové cíle ≥ 44 px** s dostatečnými rozestupy.
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

### F — Texty
- **F1 · Pojmenování podle uživatele, ne systému** („Předávka", ne „checkout record").
- **F2 · Aktivní hlas, sentence case, jeden název akce skrz celý tok** („Předat chatu" → „Chata předána").
- **F3 · Chyby se neomlouvají — říkají co a jak dál.**

### G — Přístupnost jako základ
- **G1 · Kontrast textu ≥ 4,5:1**, UI prvky ≥ 3:1 (přímo rozhoduje o C4/C5).
- **G2 · Viditelný focus, ovládání z klávesnice, `reduced motion`** od začátku.
- **G3 · Žádný text menší než ~14 px.**

### H — Signature: „dýchat tvou chatou"
- **H1 ⭐ → (a) Umírněně.** Appka zná jméno a jednu fotku chaty (hero na dashboardu, přihlášení), jinak zůstává klidná a čitelná. Osobnost v detailech, ne v chaosu.

---

## Jak se pravidla používají v návrzích

Každá varianta obrazovky (A/B/C) musí projít tímhle filtrem; verdikt „A je nejjednodušší a
doporučená" z Akcion stylu se řídí hlavně A1 (klid) + E/G (stavy, přístupnost). Rozhodnutí C4a,
C5a, H1a jsou **pevná** napříč všemi obrazovkami — varianty se v nich neliší.
