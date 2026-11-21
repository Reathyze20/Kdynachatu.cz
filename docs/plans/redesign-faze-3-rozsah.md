# Redesign – Fáze 3: Co doopravdy postavíme

Stav k **2026-11-21** · Shodnuto *spolu* (agent navrhl řez, uživatel potvrdil). Výstup Fáze 3
procesu z [redesign-proces.md](redesign-proces.md): **priorizovaný rozsah + definice
„production-ready" pro tuhle vlnu + reconciliace s roadmapou #69.** Navazuje Fáze 4 (jak to
bude vypadat a fungovat).

Fáze 3 bere katalog z [Fáze 2](redesign-faze-2-funkce.md) a **škrtá** – rozhoduje, co je
uvnitř téhle vlny, co je další vlna a co zůstává za branou.

---

## Definice „production-ready" pro tuhle vlnu

Laťka vychází z mezery Fáze 1 „co je → co si zaslouží" a z nesplněné DoD z Fáze 0. Co ji
nezvedá, jde do pozdější vlny.

- **(a) Nevypadá to jako prototyp.** Vizuální redesign (design systém „Moderní Les"), prázdné
  stavy, první dojem (X2).
- **(b) Nic nepadá, data sedí.** Tenant-isolation testy (#64), tvrdá kontrola kolizí rezervací
  (A1b), splněná DoD z [PRODUCT.md](../PRODUCT.md): e-mail, monitoring, off-site záloha, smoke
  test na telefonu.
- **(c) Jádro okouzlí.** Klín D1 → B1 → A1/A2 → C1 dotažený do konce, ne „taky tam je".

---

## Řez do vln (reconciliace s #69)

| Vlna | Obsah | Vztah k #69 | Blokuje |
| --- | --- | --- | --- |
| **V0 – základy (předpoklad)** | Rodina reálně online · backend harness + tenant-isolation testy | #63 + #64 | #63 = server/DNS/e-mail → **člověk**; #64 = agent |
| **V1 – production-ready jádro** ⭐ | Redesign vzhledu (design systém) · D1 předávka (okouzlit) · B1 příjezdová karta · A1/A2 spolehlivá rezervace + řetězec · C1 zásoby · E1 nudge · X1 systémový share · X2 první dojem / prázdné stavy | **Krok 6 (#66)** | agent |
| **V2 – diferenciátory** | P1 férové dělení bez správce · K2 kontinuita · M1/M2 údržba + návody na techniku · C1d AI účtenka · R1 úroda / roční úkoly | nové oblasti → **nová issues** mimo #66 | agent |
| **V3 – za roadmapou / branou** | F1 finance (po ADR-0005) · web push (E1d) · onboarding + role (X3/X4) · komerce | #65 (push), #67 (role), #68 | mix |

**Hlavní tah.** V1 = **čistý Krok 6** (jádro + vzhled + solidita). Nové funkční oblasti z Fáze 2
(P1, R1, F1, AI účtenka) se **nemíchají do redesignu** – padají do V2/V3 jako samostatné kroky.
Tím drží slib Fáze 1 „redesign nepřidává nové oblasti" a zároveň se nic neztrácí.

---

## Rozhodnutí Fáze 3 (co se tu seškrtalo a proč)

1. **Krok 6 (redesign) má přednost před #65/#67.** Roadmapa #69 je řadí dřív, ale cíl téhle
   vlny = **adopce rodinou**. Nemá smysl stavět koordinační vrstvu (#65) ani model rolí (#67),
   když appka nevypadá na to, aby ji rodina vůbec začala používat. Vzhled + solidní jádro jsou
   vstupní podmínka adopce, ta je podmínka všeho dalšího.
2. **P1 férové dělení → V2, ne V1.** Silný diferenciátor, ale velká nová funkce. První sezónu se
   rodina domluví u stolu; appka to přebere až příští. Do production-ready jádra nepatří.
3. **AI účtenka (C1d) → V2, ne V1.** „Wow", ale ne blokující a nese riziko přesnosti rozpoznání.
   Nesmí zdržet dodání jádra.
4. **R1 úroda / roční úkoly → stačí zápis rozhodnutí, bez ADR.** Levná, malá, emočně sedí. ADR
   (drahé/nevratné rozhodnutí) vzniká **jen na finance** – tam je riziko sociálního napětí reálné.

---

## ADR z Fáze 3

- **[ADR-0005](../adr/0005-finance-jen-drzi-fakta.md) – Finance jen „drží fakta".** Appka
  eviduje náklad (co, kolik, kdo platil); **žádný automatický výpočet dílů ani „kdo komu dluží".**
  Povinné dle Fáze 2 před jakoukoli stavbou F1 (nová oblast vyloučená ve Fázi 1).

---

## Co jde do Fáze 4 (vstup pro design)

**Design + architektura řeší jen V1** (zbytek až se k němu dojde). Těžiště návrhu:

- **Klín okouzlení:** D1 předávka → B1 příjezdová karta → A1/A2 rezervace + řetězec → C1 zásoby.
- **Průřez „production-ready pocit":** X1 systémový share, X2 první dojem / prázdné stavy, celý
  vizuální redesign (revize design systému „Moderní Les" z `CabinSaaS_Architect`).
- **Emoce (Fáze 2):** appka má dýchat *tou konkrétní* chatou, ne být generická – kotva Fáze 4.

**Nestaví se v téhle vlně:** P1, R1, F1, AI účtenka, web push, onboarding + role (viz tabulka vln).
