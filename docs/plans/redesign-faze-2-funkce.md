# Redesign – Fáze 2: Co všechno by mohlo existovat

Stav k **2026-11-21** · Shodnuto při procházení katalogu. Výstup Fáze 2 procesu z
[redesign-proces.md](redesign-proces.md): **seznam funkcí s odůvodněním, každá navázaná na
úkol uživatele z [Fáze 1](redesign-faze-1-vize.md).** Navazuje Fáze 3 (co doopravdy postavíme).

Katalog je **předfiltrovaný** návrhovými pravidly z Fáze 1 (Test domluvy, Nenutit zápis) a
hranicemi vize. Verdikty jsou doporučení agenta potvrzená uživatelem; Fáze 3 z nich škrtá.

**Legenda:** ✅ dává smysl (kandidát do Fáze 3) · ⚠️ hraniční (jen za podmínky / nižší
priorita) · ❌ nestavíme (doloženo proč).

---

## Rozhodnutí o hranici vize (nová oblast = drahé, proto zapsáno)

Fáze 1 řekla „redesign nepřidává nové funkční oblasti". Při katalogu jsme to **vědomě
revidovali** — dvě oblasti jdou dovnitř:

1. **Úroda / zahrada / roční úkoly chaty (R1).** Dovnitř. Levné, emočně sedí, řeší reálnou
   ztrátu znalosti mezi turnusy („kdy jet na meruňky").
2. **Finance (F1).** Dovnitř **jen v měkké podobě: appka drží fakta** (co se koupilo, kolik,
   kdo platil), **rozdělení nechává na lidech.** Žádný automatický výpočet dílů, žádné
   „dluhy". Důvod omezení: rozdělení podle možností (babička míň) je citlivý rodinný rozhovor
   u stolu — automat by nadělal víc škody než užitku. Protože jde o novou oblast vyloučenou
   ve Fázi 1, **vzniká k ní ADR ve Fázi 3** před jakoukoli stavbou.

### Klíčové omezení: chata nemá správce
Ověřeno s uživatelem: *„Nikdo to neorganizuje, každý sám — a pak je v tom bordel."* Ten
bordel je hlavní bolest, kterou appka řeší. Důsledek pro návrh: **jádrové toky nesmí
předpokládat správce.** Appka je **neutrální organizátor** — drží pravdu a dělí sezónu
automaticky / dohodou, ne tím, že to „někdo vezme". (Role správce ve Fázi 1 je tím oslabena;
plný model rolí zůstává na #67 / ADR-0001.)

---

## Průřezové principy (nejsou funkce, ale platí napříč)

- **Emoce / nádech chaty.** Cíl pocitu: *těšení se na chatu, radost z appky, „nádech *té
  vaší* chaty".* Appka nesmí být generická — má dýchat konkrétní chatou daného uživatele.
  → kotva pro **Fázi 4 (jak to vypadá a je cítit)**.
- **Maximální zjednodušení vstupu (i přes AI).** Rozšíření pravidla „Nenutit zápis": vstup
  má být co nejlevnější. Kde to jde, nahradit psaní fotkou / skenem. → viz C1d.
- **Krmit, ne nahrazovat kanál.** Výstupy kanálově agnosticky (systémový share), ne vlastní
  chat. Zakotveno v [ADR-0004](../adr/0004-krmit-nenahrazovat-kecaci-kanal.md). → viz X1.

---

## Katalog funkcí (po blocích úkolů z Fáze 1)

### P — Plánování sezóny
| # | Funkce | Úkol | Verdikt |
|---|---|---|---|
| P1a | Sběr preferencí/dostupnosti před sezónou (preferované týdny + blackouty per domácnost) | P1 | ✅ async, nesladíš u stolu |
| P1b | Férový návrh rozvrhu z preferencí **bez správce** (automat/dohoda, paměť minulé sezóny) | P1 | ✅ silný diferenciátor, musí jet bez šéfa |
| P1e | Paměť spravedlnosti napříč sezónami („kdo loni dostal srpen") | P1/P2 | ✅ bez paměti to nikdo neuhlídá |
| P2a | Statistika nocí/pobytů per domácnost za sezónu | P2 | ✅ vedlejší produkt rezervací |
| P2b | Víceletá historie pobytů | P2 | ⚠️ nižší priorita |
| P1c | Ruční skládání rozvrhu správcem | P1 | ❌ chata nemá správce |
| P1d | „Draft" termínů (střídavý výběr) | P1 | ❌ moc rituálu na rodinu |

### A — Než vyrazím
| # | Funkce | Úkol | Verdikt |
|---|---|---|---|
| A1a | Kalendář + zabrání termínu (existuje → redesign na spolehlivost a vzhled) | A1 | ✅ **klín** — vstupní brána cyklu |
| A1b | Tvrdá kontrola kolizí (nedovolit dvojrezervaci) | A1 | ✅ spolehlivost = důvěra |
| A2a | Na detailu pobytu vidět předchozí a následující turnus | A2 | ✅ krmí předávku B1/D1 |
| A2b | Kontakt na souseda v řetězci (volat/napsat) | A2 | ✅ krmí kanál |
| A3a | Zadat počet osob / spolucestující k pobytu | A3 | ✅ vedlejší produkt, krmí zásoby |
| A1c | Žádost o termín + schválení vs. přímé zabrání | A1 | ⚠️ závisí na modelu rolí (#67) |
| A1d | Čekací listina / „dej vědět, až se uvolní" | A1 | ⚠️ async, nižší priorita |
| A3b | Mazlíčci / zvláštní potřeby | A3 | ❌ zatím bez use-case → parkoviště |

### B — Příjezd
| # | Funkce | Úkol | Verdikt |
|---|---|---|---|
| B1a | „Příjezdová karta" složená automaticky z odjezdové předávky předchozího (D1) | B1 | ✅ **klín**, čistý vedlejší produkt |
| B2a | Stálá karta „přístup" (klíč / kód / brána) — součást M2 | B2 | ✅ pravda musí trvat |
| B2b | Dočasný přístupový kód per turnus | B2 | ✅ ano, nižší priorita |
| B1b | Push/nudge při příjezdu „tady je briefing" | B1 | ⚠️ závisí na web push (#65) |

### C — Pobyt
| # | Funkce | Úkol | Verdikt |
|---|---|---|---|
| C1a | Sdílený seznam zásob/nákupů (existuje → redesign) | C1 | ✅ jádro |
| C1b | Rychlé „došlo mi X" → přistane dalšímu turnusu | C1 | ✅ async kontinuita |
| C1c | Odškrtnutí „koupeno" při nákupu | C1 | ✅ |
| C1e | Share nákupního seznamu do kanálu | C1 | ✅ feed |
| C1d | **AI foto-sken nákupu/účtenky → položky do zásob** | C1 | ⚠️ směr ✅; cílit na účtenku (sken police je nepřesný) |

### D — Odjezd (těžiště, musí okouzlit)
| # | Funkce | Úkol | Verdikt |
|---|---|---|---|
| D1a | Strukturovaný odjezdový checklist (voda, topení, lednice, odpadky, úklid) | D1 | ✅ **jádro produktu** |
| D1b | Foto ke stavu / položkám | D1 | ✅ důvěra + async |
| D1c | Předvyplnění ze šablony chaty / minulé předávky | D1 | ✅ sníží tření |
| D1d | Rychlá cesta „vše OK" vs. detailní | D1 | ✅ UX |
| D1e | Automatická kompozice briefingu pro dalšího (→ B1a) | D1 | ✅ propojuje těžiště s příjezdem |
| D1f | Share předávky do kanálu | D1 | ✅ feed |
| D2a | Z předávky rovnou založit položku do oprav (M1) nebo nákupu (C1) | D2 | ✅ vedlejší produkt |
| D2b | Závažnost (urgentní vs. počká) | D2 | ⚠️ nižší priorita |

### E — Průběžně
| # | Funkce | Úkol | Verdikt |
|---|---|---|---|
| E1a | Nudge „něco visí na mně" (existuje → redesign) | E1 | ✅ jádro |
| E1b | Připomínka blížícího se pobytu | E1 | ✅ |
| E1c | Připomínka nevyplněné předávky po odjezdu | E1/D1 | ✅ hlídá, aby těžiště nepropadlo |
| E1d | Web push notifikace | E1 | ⚠️ patří Kroku 5 (#65) — timing |
| E1e | Digest „co je nového na chatě" do kanálu | E1 | ⚠️ riziko šumu |

### K — Kontinuita
| # | Funkce | Úkol | Verdikt |
|---|---|---|---|
| K2a | Vzkaz navázaný na konkrétní následující turnus („nechal jsem v mrazáku…") | K2 | ✅ async |
| K2b | Vzkaz připnutý k oblasti (zásoby/kalendář), ne samostatná nástěnka | K2 | ✅ v souladu s ADR-0004 |
| K2c | Potvrzení, že další přečetl | K2 | ⚠️ nižší priorita |

### M — Údržba / majetek
| # | Funkce | Úkol | Verdikt |
|---|---|---|---|
| M1a | Trvalý seznam závad se stavem (nahlášeno / řeší se / hotovo) | M1 | ✅ napříč turnusy |
| M1c | Foto závady | M1 | ✅ |
| M1d | Napojení z předávky (D2a) | M1 | ✅ |
| M1b | Kdo to vzal / termín opravy | M1 | ⚠️ |
| M2a | Trvalé „jak na to" karty (bojler, uzávěr vody, Wi-Fi) | M2 | ✅ pravda musí trvat |
| M2b | Kontakty (instalatér, soused, správce opravy) | M2 | ✅ |
| M2c | **Foto/video návody na techniku** (ecoflow, soláry…) | M2 | ✅ modernizace chat, pro nové uživatele věci |

### R — Roční cyklus chaty *(nová oblast, viz rozhodnutí výše)*
| # | Funkce | Úkol | Verdikt |
|---|---|---|---|
| R1a | Roční opakované stěžejní úkoly (zazimování, tráva, uzávěr vody…) — kdo letos | R1 | ✅ |
| R1b | **Monitoring úrody / sezónní timing** (meruňky, ořechy — „kdy jet") | R1 | ✅ emočně silné, drží ztrácenou znalost |

### F — Finance *(nová oblast, jen měkká podoba — ADR ve Fázi 3)*
| # | Funkce | Úkol | Verdikt |
|---|---|---|---|
| F1a | Evidence nákladů (co, kolik, kdo platil) — **appka drží fakta** | F1 | ✅ měkká verze |
| F1b | Automatický výpočet dílů podle možností / „kdo komu dluží" | F1 | ❌ citlivé — rozdělení nechat na lidech |

### Napříč (rozhodují o „production-ready" pocitu)
| # | Funkce | Verdikt |
|---|---|---|
| X1 | Systémový share sheet (kanálově agnostický) místo jen „Kopírovat pro WhatsApp" | ✅ strategická sázka / ADR-0004 |
| X2 | Prázdné stavy a první dojem (aby to nevypadalo jako prototyp) | ✅ mezera „co je → co si zaslouží" |
| X3 | Onboarding chaty (založit, pozvat domácnosti) | ⚠️ naráží na členství (#67, ADR-0001) |
| X4 | Role správce/člen v UI | ⚠️ závisí na #67 |

---

## Parkoviště a zamítnuto (aktualizováno po Fázi 2)

| Položka | Stav | Důvod |
|---|---|---|
| A4 Co vzít s sebou | parkoviště | patří Kroku 5 (#65) |
| A3b Mazlíčci / potřeby | parkoviště | zatím bez use-case |
| H1/H2 Hosté | venku | rodina chatu nepůjčuje — segment 2 / ADR-0001 |
| Deník rozhodnutí / „zaloguj vše" | zamítnuto | otrava > užitek (potvrzeno znovu) |
| Samostatná nástěnka dohod | zamítnuto | riziko mrtvé obrazovky — rozpuštěno do oblastí |
| P1c správce skládá rozvrh · P1d draft | zamítnuto | chata nemá správce / moc rituálu |

---

## Co jde do Fáze 3 (vstup pro priorizaci)

**Klín (okouzlit / musí fungovat):** D1 předávka → B1 příjezdová karta → A1/A2 spolehlivá
rezervace + řetězec → P1 férové dělení **bez správce**.

**Potvrzené jádro:** C1 zásoby (+ AI účtenka jako wow), E1 nudge, K2 kontinuita, M1/M2
údržba + návody na techniku, X1 share + X2 první dojem.

**Nová oblast dovnitř, ale opatrně:** R1 úroda/roční úkoly (levné, emoční) · F1 finance
**jen „drží fakta"** + **ADR** před stavbou.

**Visí na roadmapě, ne na redesignu:** web push (E1d, #65), onboarding + role (X3/X4, #67).
