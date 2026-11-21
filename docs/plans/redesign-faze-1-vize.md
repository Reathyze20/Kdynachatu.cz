# Redesign – Fáze 1: Vize a zákazník

Stav k **2026-11-21** · Shodnuto při grillingu. Výstup Fáze 1 procesu z
[redesign-proces.md](redesign-proces.md): **vizní dokument + úkoly uživatele.**
Navazuje Fáze 2 (co všechno by mohlo existovat).

Toto je *prověřená* vize – potvrzuje a zostřuje [PRODUCT.md](../PRODUCT.md), nenahrazuje ho.

---

## Vizní dokument

**Komu.** Rodina (segment 1 dle `PRODUCT.md`). Komerce zůstává za branou 30. 6. 2027;
architekturu si nezabouchneme, ale cíl téhle vlny = **adopce rodinou**.

**Proč redesign.** Řemeslo a kvalita, ne nové funkce. Appka vznikla, když autor uměl míň;
teď jí dává úroveň, kterou si zaslouží. Není to panika z chybějících funkcí ani z adopce.

**Mezera „co je → co si zaslouží."** (a) jak to vypadá a ovládá se (vzhled/UX, že to není
prototyp) + (b) jak je to solidní a důvěryhodné (nic nepadá, data sedí). (c) kvalita
kódu/testů **slouží (b)**, není cíl sama o sobě.

**Problém.** Koordinace střídané sdílené chaty se dnes řeší roztříštěně – WhatsApp + telefon
+ osobně, **bez jasného hubu**. Rozhodnutí padnou v hovoru / u stolu a zmizí; nikdo
spolehlivě neví, *v jakém stavu chata je, kdo kdy jede a co dochází*. Těžiště bolesti =
**předávka mezi po sobě jedoucími domácnostmi** (rotace, ne společné pobyty).

**Slib.** „Appka drží strukturovanou pravdu o chatě – kdo kdy jede, v jakém stavu ji poslední
nechal, co dochází – a hotové výstupy sdílí do libovolného kanálu. Rodina se nedohaduje a nic
nepropadne."

**Hranice (co vědomě zůstává venku).**
- Nenahrazuje kecací kanál, jen ho krmí ([ADR-0004](../adr/0004-krmit-nenahrazovat-kecaci-kanal.md)).
- Není pro jednu domácnost s vlastní chatou.
- Žádný pronájem, WhatsApp bot, i18n, platby ani app store před branou komerce 2027.
- Redesign **nepřidává nové funkční oblasti** – „láska" jde do jádra + vzhledu/solidity.

**Návrhová pravidla** (filtr rozsahu pro všechny další fáze):
- **Test domluvy.** Appka staví jen tam, kde **prostá domluva lidí selhává** – přes čas a
  turnusy (paměť, kontinuita), když nejsou všichni naráz k mání (async), nebo když pravda musí
  trvale držet. Kde stačí říct si to u stolu, appka nestaví nic.
- **Nenutit zápis.** Pravda vzniká jako **vedlejší produkt věcí, co lidi dělají tak jako tak**
  (rezervace, předávka, nákup), ne jako úkol „zaloguj to". Žádná disciplína navíc.

**Strategická sázka.** Krmit, ne nahrazovat; výstup kanálově agnosticky (systémový share).
Vratné, spouštěč znovuotevření = brána 2027. Detail a varianty v
[ADR-0004](../adr/0004-krmit-nenahrazovat-kecaci-kanal.md).

---

## Mapa úkolů uživatele

Seřazeno podle rotačního cyklu jednoho turnusu + sdílené/průběžné. Krmí Fázi 2 (každá možná
funkce se váže na úkol). Mapa je otevřená – další úkoly se přidávají přes parkoviště.

| Blok | Úkol |
| --- | --- |
| **P – Plánování sezóny** | **P1** Zadat svou dovolenou/dostupnost a rozdělit sezónu fér, ať si každý přijde na svoje a nikdo se necítí ošizený · **P2** Přehled „kdo kolik byl" za sezónu |
| **A – Než vyrazím** | **A1** Zabrat volný termín (rezervace) · **A2** Vidět, kdo jede přede mnou a po mně · **A3** Přibrat spolucestující / nahlásit počet |
| **B – Příjezd** | **B1** Dostat briefing: v jakém stavu chatu nechal předchozí · **B2** Přístup – kde je klíč / kód |
| **C – Pobyt** | **C1** Vidět a doplňovat, co dochází / co koupit |
| **D – Odjezd (těžiště)** | **D1** Vyplnit stav při odjezdu → předávka pro dalšího · **D2** Nahlásit, co se rozbilo / co dochází |
| **E – Průběžně** | **E1** Nudge, když něco visí na mně (+ připomínka blížícího se pobytu), a poslat to do rodinného kanálu |
| **Kontinuita** | **K2** Vzkaz dalšímu turnusu i mimo předávku („nechal jsem ti v mrazáku…") |
| **Údržba / majetek** | **M1** Trvalý seznam „co je rozbité / čeká na opravu" napříč turnusy · **M2** Manuál „jak na chatu" (bojler, uzávěr vody, Wi-Fi) |

**Klín (priorita pro Fáze 3 a 5).** **D1 předávka musí okouzlit** (těžiště produktu), **A1
rezervace musí spolehlivě fungovat** (vstupní brána celého cyklu). **P1 férové plánování** =
silný diferenciátor hned za nimi.

**Trvalé dohody** (co padne mimo – „koupíme lednici", „instalatér přijde 15.") se **připínají
k té oblasti, které se týkají** (zásoby / kalendář / vzkaz K2), ne do samostatné nástěnky –
viz ADR-0004.

---

## Parkoviště (zachyceno, teď nestavíme)

| Nápad | Důvod odložení |
| --- | --- |
| **F1** Společné náklady / kdo kolik dluží | Nová funkční oblast (peníze), napětí s hranicí „žádné nové oblasti" |
| **A4** „Co vzít s sebou / co na chatě je" | Patří do Kroku 5 roadmapy (#65 koordinační vrstva) |
| **R1** Sezónní úkoly chaty (zazimování, tráva) – kdo letos | Nová oblast, blízko M1; zvážit později |
| **Hosté (H1, H2)** Pozvánka hosta + potvrzení stavu | Rodina chatu nepůjčuje; patří segmentu 2 / [ADR-0001](../adr/0001-clenstvi-uzivatel-chata.md), ne vizi rodiny |

**Zamítnuto:** „zaloguj všechno" / deník rozhodnutí (nikdo nebude, otrava > užitek) ·
samostatná „nástěnka dohod" (riziko mrtvé obrazovky, rozpuštěno do existujících oblastí).
