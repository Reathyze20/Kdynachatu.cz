# ADR-0005: Finance jen „drží fakta", rozdělení nechává na lidech

Datum: 2026-11-21 · Stav: přijato

## Kontext

Fáze 1 redesignu ([redesign-faze-1-vize.md](../plans/redesign-faze-1-vize.md)) řekla, že
redesign **nepřidává nové funkční oblasti**, a společné náklady (F1) odložila na parkoviště –
peníze jsou nová oblast v napětí s touhle hranicí. Při katalogu Fáze 2
([redesign-faze-2-funkce.md](../plans/redesign-faze-2-funkce.md)) jsme hranici **vědomě
revidovali**: evidence nákladů se v rodině reálně řeší a dnes se ztrácí, kdo co zaplatil.

Zároveň platí klíčové omezení z Fáze 2: **chata nemá správce.** Appka je neutrální
organizátor, ne nástroj, kterým někdo účtuje ostatním. Rozdělení nákladů podle možností
(babička platí míň, kdo jezdí víc platí víc) je **citlivý rodinný rozhovor u stolu** – automat,
který vypočítá „dluhy", by do rodiny vnesl napětí a nadělal víc škody než užitku.

Protože jde o novou oblast vyloučenou ve Fázi 1, Fáze 3 ([redesign-faze-3-rozsah.md](../plans/redesign-faze-3-rozsah.md))
žádá před jakoukoli stavbou F1 tento ADR.

## Rozhodnutí

Appka u financí **drží jen fakta**: eviduje náklad – *co se koupilo, kolik to stálo, kdo to
zaplatil* – jako strukturovanou pravdu napříč turnusy. **Rozdělení nechává výhradně na lidech.**

Appka **nepočítá díly, nevede „kdo komu dluží", nenavrhuje vyrovnání ani nikoho neupomíná.**
Výstup (přehled „kdo kolik zaplatil") se sdílí do rodinného kanálu přes systémový share
([ADR-0004](0004-krmit-nenahrazovat-kecaci-kanal.md)); vyúčtování si rodina udělá sama.

Je to **vratná sázka.** Pokud se ukáže, že rodina měkkou evidenci reálně používá a sama si
řekne o víc, otázka „počítat díly" se otevře znovu – s důkazem, ne předem. Spouštěč stejný jako
u ADR-0004: brána komerce 30. 6. 2027.

## Zvažované varianty

- A: **Měkká evidence – drží fakta, dělení na lidech** (+ levné, řeší reálnou ztrátu „kdo
  platil", nevnáší sociální napětí, sedí na „appka nemá správce"; − nevyřeší samotné vyrovnání,
  to zůstává u stolu).
- B: Plné vyúčtování – automatický výpočet dílů, „kdo komu dluží", upomínky (+ appka dořeší celý
  cyklus; − rozdělení podle možností je citlivé, automat působí jako účtování mezi rodinou,
  předpokládá správce/autoritu, kterou chata nemá).
- C: Finance vůbec nestavět (+ drží slib Fáze 1 „žádné nové oblasti"; − ignoruje reálnou bolest,
  kterou Fáze 2 doložila).

## Důsledky

- Datový model financí nese jen *náklad → (co, kolik, kdo platil, k jakému pobytu/oblasti)*;
  žádná entita „dluh", „podíl" ani „vyrovnání".
- UI financí nikdy nezobrazuje „X dluží Y" ani cílovou částku k zaplacení – jen přehled fakt.
- Napojení na existující oblasti (nákup z C1 zásob může založit záznam nákladu), ne samostatná
  „účetní" sekce odtržená od zbytku.
- Finance jsou ve Fázi 3 zařazené až do **V3** (za roadmapou), ne do production-ready jádra V1.
- Přehodnotit u brány 2027 podle toho, jestli rodina měkkou evidenci reálně používá.
