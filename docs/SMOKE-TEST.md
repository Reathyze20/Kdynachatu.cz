# Smoke test – desktop a mobil

> Sloučeno 2026-11-17 ze SPRINT-0 a SPRINT-3. Používá se před každým produkčním release (ADR-0002) a pro „rodina online“ (krok 3 roadmapy). **Pročištění je součást kroku 3:** část textu ještě počítá s ověřením e-mailu před přihlášením a se starou doménou; mobilní scénáře zkrátit na krátký checklist pro Android.

Smoke-test script pro post-deploy kontrolu nejdulezitejsich flows: `login`, `registrace`, `verify`, `invite` a `admin shopping`.

## Kratky operational smoke pred rucnim E2E

Nez otevres browser profily, udelej nejdriv rychly operational check:

```powershell
.\manual-post-deploy-smoke-check.ps1
```

Fast smoke ma potvrdit toto minimum:

- PM2 proces `chata-app` je `online`,
- lokalni `GET /api/health` vraci `status = ok`,
- verejny web odpovida,
- verejny health endpoint odpovida.

Kdyz tohle neprojde, nema smysl pokracovat do manualnich funkcich scenaru. Nejdv otevri `docs/OPERATIONS-RUNBOOK.md` a vyres operational problem.

## Jak testovat

- Pouzij dva browser profily.
- Profil A: novy admin.
- Profil B: anonymni okno nebo druhy profil pro pozvaneho clena.
- U novych uctu pouzivej casovy suffix v username a e-mailu, at nenarazis na duplicity.

## Rizeny rodinny rehearsal: desktop + mobil

Pouzij tento flow, kdyz chces projet jeden realisticky rodinny scenar nad tim, co uz je dnes hotove, bez zavislosti na produkcnich e-mailech.

Role a zarizeni:

- Desktop / Profil A: existujici admin.
- Mobil / Profil B: pozvany clen.
- Pozvanku posilej z Adminu kopirovanym linkem nebo pres WhatsApp, nepres produkcni e-mail flow.
- Po kazdem failu si zapis route, roli, zarizeni, viewport a screenshot.

Doporucena trasa:

1. Desktop admin login a dashboard orientace
Kde: `/login` -> `/dashboard`
Kroky: Prihlas admina, proved refresh, projdi activation checklist a otevri hlavni navigaci.
Ocekavany vysledek: Dashboard se nacte bez redirect loopu, shell je stabilni a CTA davaji smysl.

2. Desktop admin vytvori invite a preda link clenu
Kde: `/admin`
Kroky: Vytvor invite pro clena, zkopiruj link a posli ho do mobilu Profilu B.
Ocekavany vysledek: Invite je videt v seznamu a link se da otevrit bez manualniho skladani zpravy.

3. Mobilni clen prijme invite a projde prvni shell
Kde: invite URL -> `/dashboard`
Kroky: Otevri link v telefonu, dokonc onboarding clena, zkontroluj dashboard, mobile header, bottom nav a profile drawer.
Ocekavany vysledek: Clen skonci ve stejne chate, nic nema horizontalni scroll a shell se neprekryva.
Mobilni subset: scenar `14` z [SPRINT-3-MOBILE-QA-CHECKLIST.md](SPRINT-3-MOBILE-QA-CHECKLIST.md)

4. Desktop admin vytvori rezervaci, mobilni clen ji overi
Kde: `/reservations`
Kroky: Admin vytvori novou rezervaci. Clen na mobilu otevre rezervace, prepne mesic, otevre detail a vrati se zpet.
Ocekavany vysledek: Rezervace je videt v obou profilech, kalendar na mobilu nescrolluje do stran a detail/CTA se neprekryvaji.
Mobilni subset: scenare `1`, `2` a `3` z [SPRINT-3-MOBILE-QA-CHECKLIST.md](SPRINT-3-MOBILE-QA-CHECKLIST.md)

5. Mobilni clen vytvori shopping data, desktop admin je spravuje
Kde: `/shopping`
Kroky: Clen vytvori seznam a prida polozku. Admin na desktopu seznam najde, prejmenuje ho nebo smaze.
Ocekavany vysledek: Data zustanou po refreshi, propisuji se obema profilum a admin zvladne cizi seznam bez permission chyby.
Mobilni subset: scenare `7` a `8` z [SPRINT-3-MOBILE-QA-CHECKLIST.md](SPRINT-3-MOBILE-QA-CHECKLIST.md)

6. Mobilni clen posle zpravu, desktop admin ji vidi a odpovi
Kde: `/notes`
Kroky: Clen otevre Notes, posle zpravu, admin ji na desktopu najde a odpovi. Na mobilu otevri jedno tema a vrat se zpet do seznamu.
Ocekavany vysledek: Chat je citelny, bez dvojiteho scrollu a bez zaseknute vysky po navratu.
Mobilni subset: scenare `4`, `5` a `6` z [SPRINT-3-MOBILE-QA-CHECKLIST.md](SPRINT-3-MOBILE-QA-CHECKLIST.md)

7. Mobilni clen nahraje fotku a desktop admin ji zkontroluje v galerii
Kde: `/gallery`
Kroky: Nahraj fotku z telefonu, na desktopu otevri album a zkontroluj lightbox nebo detail.
Ocekavany vysledek: Upload dobehne bez blockeru, fotka je videt obema rolím a mobilni toolbar/lightbox drzi viewport.
Mobilni subset: scenare `9` a `10` z [SPRINT-3-MOBILE-QA-CHECKLIST.md](SPRINT-3-MOBILE-QA-CHECKLIST.md)

8. Denik a lehka admin kontrola
Kde: `/diary`, `/admin`
Kroky: Pokud existuje relevantni pobyt nebo den, otevri denik a over vstup do detailu. Pak se vrat do adminu a zkontroluj, ze je clen videt mezi uzivateli a invite stav dava smysl.
Ocekavany vysledek: Denik se nerozbije na mobilu a admin ma prehled o clenech i invite stavu bez zasahu do DB.
Mobilni subset: scenar `11` z [SPRINT-3-MOBILE-QA-CHECKLIST.md](SPRINT-3-MOBILE-QA-CHECKLIST.md)

9. Offline truthfulness spot-check na mobilu
Kde: `/shopping` nebo `/notes`
Kroky: Na jiz otevrene strance zapni v telefonu rezim Letadlo. Over offline banner, zkus bezpecny reload obrazovky a po navratu site zkontroluj, ze copy neslibuje automatickou synchronizaci. Pokud zkousis mutaci, po obnoveni site ji manualne over nebo zopakuj.
Ocekavany vysledek: Banner i toast rikaji pravdu: app muze ukazat drive nactena data, ale nove zmeny je potreba po navratu spojeni overit.

10. Zapis vysledku a backlogu
Kde: libovolny sdileny notes/doc
Kroky: Sepis blocker, mensi UX drhnuti a route, ktere je potreba dojet.
Ocekavany vysledek: Po jednom pruchodu vis, jestli je rodinny tok pouzitelny, nebo co jeste konkretne chybi.

## Scenare

1. Auth vstup a prepnuti na registraci
Predpoklady: Cista session, nikdo neni prihlaseny.
Kroky: Otevri `/login`. Over nadpis prihlaseni. Klikni na registraci.
Ocekavany vysledek: Zobrazi se registracni formular bez 404, prazdne stranky nebo nekonecneho spinneru.
Jak poznat fail: Formular se neprepne nebo appka spadne.

2. Registrace nove chaty a admin uctu
Predpoklady: Unikatni nazev chaty, username a dorucitelny e-mail.
Kroky: Vypln nazev chaty, lokaci, username, e-mail, heslo, barvu a odesli formular.
Ocekavany vysledek: Zobrazi se stav s instrukci zkontrolovat e-mail. Ucet jeste neni automaticky prihlaseny.
Jak poznat fail: Validni data vrati obecnou chybu nebo aplikace preskoci rovnou na dashboard.

3. Login je pred verify zablokovany
Predpoklady: Ucet z predchoziho kroku jeste neni overeny.
Kroky: Zkus se prihlasit novym jmenem a heslem.
Ocekavany vysledek: Appka zustane na auth obrazovce a zobrazi hlasku, ze je nejdriv potreba overit e-mail.
Jak poznat fail: Ucet pusti uzivatele do dashboardu nebo vrati nejasnou chybu.

4. Verify link z e-mailu funguje end-to-end
Predpoklady: Doruceny registracni e-mail s tokenem.
Kroky: Otevri aktivacni odkaz z e-mailu.
Ocekavany vysledek: Kratky loading a potom stav `Overeni uspesne` s tlacitkem pro prihlaseni.
Jak poznat fail: Zobrazi se `Overeni selhalo`, `Chybi overovaci odkaz` nebo loading nikdy neskonci.

5. Overeny admin login
Predpoklady: Ucet je po verify aktivni.
Kroky: Prihlas se pres `/login` a po nacteni dashboardu proved refresh.
Ocekavany vysledek: Uspesny redirect na `/dashboard` a session prezije refresh.
Jak poznat fail: Redirect loop, okamzity logout nebo prazdny shell aplikace.

6. Admin vytvori invite v Admin panelu
Predpoklady: Profil A je prihlaseny jako admin.
Kroky: Otevri `/admin`, najdi sekci Pozvanky, vytvor pozvanku s roli clen a zkopiruj link.
Ocekavany vysledek: V seznamu aktivnich pozvanek pribude novy radek s roli, expiraci a pouzitelnym linkem obsahujicim `/invite/`.
Jak poznat fail: Sekce chybi, vytvoreni vrati chybu nebo kopirovani nic neudela.

7. Invite landing page nacita spravna data
Predpoklady: Cerstvy invite link a Profil B bez session.
Kroky: Otevri invite URL v Profilu B.
Ocekavany vysledek: Zobrazi se stranka pozvanky s nazvem chaty, zvoucim uzivatelem, roli a CTA pro pokracovani.
Jak poznat fail: Cerstvy link skonci jako neplatny nebo hodi uzivatele jinam.

8. Prijeti invite vytvori clena a rovnou ho prihlasi
Predpoklady: Validni invite URL v Profilu B.
Kroky: Klikni na pokracovat, vypln profil pozvaneho clena a odesli formular.
Ocekavany vysledek: Ucet se vytvori, clen je automaticky prihlasen a skonci na `/dashboard` stejne chaty.
Jak poznat fail: Uzivatel zustane bez session, dostane 500 nebo neskonci v aplikaci.

9. Pozvany clen vytvori shopping list a polozku
Predpoklady: Profil B je prihlaseny jako novy clen.
Kroky: Otevri `/shopping`, vytvor novy seznam a pridej jednu polozku. Potom refreshni stranku.
Ocekavany vysledek: Seznam i polozka zustanou zachovane i po refreshi.
Jak poznat fail: Data po refreshi zmizi nebo se objevi permission chyba.

10. Admin vidi shopping list vytvoreny clenem
Predpoklady: V Profilu B uz existuje shopping list s polozkou. Profil A je admin.
Kroky: V Profilu A otevri `/shopping` a najdi list vytvoreny clenem.
Ocekavany vysledek: Admin list vidi, muze ho otevrit a obsah sedi s daty z Profilu B.
Jak poznat fail: Data se mezi profily neshoduji nebo admin list nevidi.

11. Admin zvladne cizi shopping list prejmenovat a smazat
Predpoklady: Profil A ma otevreny memberuv shopping list.
Kroky: Prejmenuj seznam, pak ho smaz a nakonec refreshni Profil A i Profil B.
Ocekavany vysledek: Prejmenovani i smazani se propise v obou profilech bez permission chyby.
Jak poznat fail: Nazev se po refreshi vrati, mazani se nepropise nebo list zmizi jen jednomu uzivateli.

12. Zrusena pozvanka je opravdu neplatna
Predpoklady: Admin v Profilu A umi vytvorit druhou pozvanku.
Kroky: Vytvor druhy invite, zkopiruj link, invite hned zrus a otevri jeho URL v Profilu B.
Ocekavany vysledek: Link uz nepusti do onboardingu a zobrazi neplatnou pozvanku.
Jak poznat fail: Zruseny link stale dovoli registraci.

## Minimalni post-deploy subset

Pokud je cas jen na minimum, proved po uspesnem operational smoke vzdy scenare `2`, `4`, `5`, `8` a `11`.

---

# Mobilní checklist (dříve SPRINT-3-MOBILE-QA-CHECKLIST)


Manualni regression checklist pro viewporty `320px` a `375px` po mobilnich upravach ve `frontend-v2`.

## Jak pouzit

- Kazdy scenar proved nejdriv na `320px`, pak hned zopakuj na `375px`.
- Sleduj hlavne horizontalni overflow, prekryvani fixed prvku a velikost tap targetu.
- Pokud scenar selze, zapis route, viewport, presne kroky a screenshot.

## Mobilni subset pro rodinny rehearsal

Kdyz nechces jet cely seznam, ale jeden realisticky rodinny pruchod s desktop adminem a mobilnim clenem, udelej v tomhle poradi aspon scenare `14`, `1`, `2`, `3`, `4`, `7`, `9`, `10` a `11`.

Doporucene zasazeni do rehearsal flow z [SPRINT-0-SMOKE-TEST.md](SPRINT-0-SMOKE-TEST.md):

- po prijeti invite: `14`,
- pri praci s rezervacemi: `1`, `2`, `3`,
- pri chatu a shoppingu: `4`, `7`,
- pri galerii: `9`, `10`,
- pri deniku nebo zaverecnem mobilnim dojezdu: `11`.

## Scenare

1. Rezervace: kalendar bez horizontalniho scrollu
Kde: `/reservations`
Kroky: Otevri Rezervace, prepni 2 az 3 mesice sipkami, projezd prstem po sirce karty i cele stranky.
Ocekavany vysledek: Zadny bocni posun stranky ani karty, 7 sloupcu zustane citelnych, sipky jsou pohodlne trefitelne.
Proc je to rizikove: Mobilni kalendar byl prekopan z min-width layoutu na viewport-fit grid.

2. Rezervace: den -> rozsah -> volba typu
Kde: `/reservations`
Kroky: Klepni jednou na budoucí den, podruhe na stejny den, potreti na pozdejsi den. Zavri otevreny modal pres X i backdrop.
Ocekavany vysledek: Prvni tap jen vybere den, druhy tap zahaji vyber pobytu, treti tap otevre modal s volbou. Po zavreni nic nezustane v nekonzistentnim stavu.
Proc je to rizikove: Tap-flow je nove dvoukrokovy a zavisi na kombinaci `selectedDay` a `rangeStart`.

3. Rezervace: sidebar, month picker a CTA
Kde: `/reservations`
Kroky: Otevri detail rezervace, vrat se, otevri month picker v pravem panelu, zmen mesic a doscrolluj k mesicni poznamce a CTA.
Ocekavany vysledek: Picker se vejde do viewportu, filtr dne se pri zmene mesice resetuje a CTA neni schovane pod spodni navigaci.
Proc je to rizikove: Pravy panel se na mobilu stackuje a ma vlastni scroll chovani.

4. Notes: seznam temat <-> chat bez rozbite vysky
Kde: `/notes`
Kroky: Otevri tema, scrollni chat, vrat se zpet do seznamu a pak odejdi na jinou routu a vrat se znovu.
Ocekavany vysledek: Nevznika prazdna plocha ani dvojity scroll a po odchodu z Notes nezustane stranka zaseknuta bez scrollu.
Proc je to rizikove: Notes pouziva `body.page-notes` a vlastni mobile-only overflow kontrakt.

5. Notes: composer, reply preview a odkaz Predat chatu
Kde: `/notes`
Kroky: Spust odpoved na zpravu, dopis delsi text, aby se textarea roztahla, a jako clen klepni na odkaz Predat chatu nad inputem. Prihlas se jako host a over, ze odkaz chybi.
Ocekavany vysledek: Reply preview zustava nad inputem, tlacitko Odeslat je porad viditelne a pouzitelne a odkaz vede na `/handover`. Host odkaz nevidi.
Proc je to rizikove: Kombinuje se auto-resize textarea, safe-area padding a obsah nad patou chatu; host na `/handover` dostane 403.

6. Notes: context menu a navazane dialogy
Kde: `/notes`
Kroky: Otevri message context menu, zkus akci Pridat do nakupu nebo Vytvorit ukol, pak otevri Nove tema a potvrzovaci dialog smazani.
Ocekavany vysledek: Menu ani modaly nejsou useknute, akce maji pohodlne tap targety a footer modalniho sheetu je full-width.
Proc je to rizikove: Notes ma vlastni mobilni context menu a navazuje na shared modal vrstvu.

7. Shopping: prepinac Zasoby/Nakup a vyber seznamu
Kde: `/shopping` a `/shopping?view=pantry`
Kroky: Prepni mezi Zasobami a Nakupem, v hlavicce vyber jiny seznam a zaloz novy, v Zasobach pridej polozku do nakupu jednim klepnutim. Na desktopu over sloupce Zasoby a Nakup vedle sebe.
Ocekavany vysledek: Vybrany seznam zustane vybrany i po reloadu, novy seznam se hned vybere a pridana polozka se objevi v nakupu bez prazdneho mista v layoutu.
Proc je to rizikove: Vyber seznamu se pamatuje v localStorage a mobilni a desktopovy layout se lisi.

8. Shopping pantry: sticky header a filtry
Kde: `/shopping` -> `Zasoby`
Kroky: Prejdi na Zasoby, horizontalne projezd filter chips, otevri Pridat zasobu. Na `375px` zkontroluj 2 sloupce, na `320px` pad do 1 sloupce.
Ocekavany vysledek: Chips jsou klikatelne, sticky header neodskakuje a formular se nerozbije nad spodni navigaci.
Proc je to rizikove: Pantry ma nejvic mobile-only CSS, vcetne sticky headeru a extra-small breakpointu.

9. Galerie: toolbar, hledani, selection mode a pagination
Kde: `/gallery`
Kroky: Fokusni hledani, zmen razeni, otevri album, zapni vyber a pokud je vic fotek, projezd pagination.
Ocekavany vysledek: Toolbar i pagination jsou na mobilu pohodlne scrollovatelne, fokus v hledani neodstrelí ostatni akce mimo viewport.
Proc je to rizikove: Toolbar i pagination byly nedavno prevedene na horizontalne scrollovatelny mobilni rezim.

10. Galerie: lightbox overlay
Kde: `/gallery`
Kroky: Otevri fotku, nech schovat ovladani a znovu je vyvolej tapem. Vyzkousej zavreni, dalsi fotku a pridani vzpominky.
Ocekavany vysledek: Ovládání zustane uvnitr viewportu, scroll pod lightboxem je zamceny a po zavreni se vratis na stejne misto.
Proc je to rizikove: Fullscreen overlay kombinuje autohide controls a body scroll lock.

11. Denik: vstup do dne a notebook modal
Kde: `/diary`
Kroky: Prepni period filter, otevri pobyt, klikni do konkretniho dne, otevri Fotky a vrat se, pak prepinaj predchozi/dalsi den.
Ocekavany vysledek: Hlavička ani footer se neskladaji pres sebe a modalni pata zustava full-width a citelna.
Proc je to rizikove: Diary kombinuje responsive grid, scrollovatelne filtry a mobilne prekladany notebook footer.

12. Login a registrace: inputy, eye toggle, swatches a error block
Kde: `/login`, `/register`
Kroky: Vyvolej chybu submitu, prepni zobrazeni hesla, klikni na Zapamatovat si me, na registraci projezd barevne swatches a over validacni chyby.
Ocekavany vysledek: Bez horizontalniho scrollu, inputy drzi 44px vysku, eye toggle neleze do textu a error block nepretahuje kartu pres viewport.
Proc je to rizikove: Auth karta ma mobilni prepocet rozmeru a nove hit areas pro toggle i checkbox.

13. Shared modal baseline
Kde: Notes, Shopping, Galerie, potvrzovaci dialogy
Kroky: Otevri tri reprezentativni modaly a porovnej zavirani, scroll a poradi CTA.
Ocekavany vysledek: Pod `640px` se vse chova jako spodní sheet, footer akce jsou full-width a primary CTA je dole u palce.
Proc je to rizikove: Shared modal ma mobilni `column-reverse` footer a specialni layout i pro vnoreny obsah.

14. Mobile header, bottom nav a profile drawer
Kde: libovolna prihlasena stranka
Kroky: Otevri profile drawer z avataru, scrollni ho, zavri ho backdropem a pak proklikej 4 az 5 polozek spodní navigace.
Ocekavany vysledek: Header i bottom nav drzi pozici bez prekryvani obsahu a drawer se vraci do cisteho stavu.
Proc je to rizikove: Mobilni shell kombinuje fixed header, fixed bottom nav a bottom-sheet drawer.

## Release smoke subset

Pokud je cas jen na minimum, udelej vzdy scenare `1`, `2`, `4`, `7` a `13`.