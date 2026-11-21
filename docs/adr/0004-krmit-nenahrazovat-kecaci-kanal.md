# ADR-0004: Appka drží strukturu, kecací kanál nenahrazuje

Datum: 2026-11-21 · Stav: přijato

## Kontext

Rodina (cílový segment 1, viz [PRODUCT.md](../PRODUCT.md)) koordinuje sdílenou chatu **mixem kanálů bez jasného hubu** – WhatsApp + telefon + osobně. Protože žádný kanál nedominuje, rozhodnutí často padne v hovoru nebo u stolu a **nikde se nezapíše**; za pár měsíců si nikdo nepamatuje, na čem se dohodli.

Při grillingu Fáze 1 redesignu (viz [redesign-faze-1-vize.md](../plans/redesign-faze-1-vize.md)) vznikla otázka, jestli má appka tenhle kecací provoz **nahradit** (vlastní chat + notifikace jako hlavní cíl), nebo jen **krmit** (držet strukturovanou pravdu a výstup sdílet ven). Omezení: sólo vývojář, cíl je adopce rodinou, spolehlivé push notifikace na Android PWA jsou vratké.

## Rozhodnutí

**Appka vlastní STRUKTURU** (kdo kdy jede, stav chaty, co dochází, předávka). **Kecání zůstává tam, kde rodina už kecá** – ať je to WhatsApp, telefon, nebo kuchyň. Appka ten kecací kanál **nenahrazuje**; je to jedno místo pro *pravdu*, ne druhý chat.

Výstup proto není vázaný na jeden kanál: sdílí se přes **systémový share sheet** (Android) do čehokoli, ne „Kopírovat pro WhatsApp". Plné nahrazení kecacího kanálu (vlastní chat jako hlavní cíl) se teď nestaví.

Je to **vratná sázka.** Spouštěč znovuotevření = **brána komerce 30. 6. 2027** ([PRODUCT.md](../PRODUCT.md)): pokud rodina sama od sebe přesune rezervace a předávku do appky, otázka „nahradit víc" se otevře znovu – už s důkazem, ne předem.

## Zvažované varianty

- A: **Krmit, nenahrazovat, kanálově agnosticky** (+ obchází síťový efekt, malá plocha, sedí na bránu 2027; − appka není „to jediné místo", kecání zůstává roztříštěné).
- B: Hybrid – krmit, ale vědomě stavět notifikace tak dobré, aby časem přetáhly kecání (+ otevřená cesta k nahrazení; − láká rozšiřovat notifikační plochu dřív, než je důkaz).
- C: Plné nahrazení – vlastní chat + notifikace jako hlavní cíl (− obří plocha, boj se síťovým efektem, největší riziko, že to rodina nevezme vůbec).

## Důsledky

- Výstupní akce („pošli do rodinného kanálu") míří na systémový share, ne na konkrétní appku.
- Appka neřeší vlastní ambient chat/presence/„přečteno" jako hlavní funkci (doplněk „chat" zůstává doplňkem, nerozvíjí se – viz [PRODUCT.md](../PRODUCT.md)).
- Trvalé dohody, co se nevejdou do rezervace/předávky/nákupu, se připínají k té oblasti, které se týkají, ne do samostatné „nástěnky".
- Přehodnotit u brány 2027 podle toho, jestli rodina reálně přesunula strukturní koordinaci do appky.
