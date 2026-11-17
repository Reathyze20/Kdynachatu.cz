# Kdy na chatu – produkt

Verified: 2026-11-17 · Scope: vize, segmenty a hranice produktu. Roadmapa a rozpracovaná práce žijí v GitHub Issues (map issue „Roadmapa“), ne tady.

## Co to je

Aplikace pro **sdílenou chatu**, kterou střídavě používá víc domácností. Drží strukturovanou pravdu – kdo a kdy jede, v jakém stavu chatu nechal, co dochází – a výstupy posílá do rodinného WhatsAppu. **Nesnaží se WhatsApp nahradit.**

Těžiště je **předávka mezi po sobě jedoucími domácnostmi** (rotace, ne společné pobyty).

## Pro koho

| Pořadí | Segment | Stav |
|---|---|---|
| 1 | **Naše rodina** – 2–4 dospělí z několika domácností, chata č. 1 | priorita, tenant č. 1 na verzi z `main` |
| 2 | **Sdílené chaty** – zděděné chaty, spoluvlastníci, přátelé se společnou chalupou; persona „správce sdílené chaty, 2–6 domácností“ | komerční segment, až po validaci (viz níže) |
| 3 | **Pronajímatelé** – hosté zvenku, platby, veřejná dostupnost | ne teď, samostatný modul, viz [ADR-0003](adr/0003-pronajem-modul-ne-ted.md) |

Jedna domácnost s vlastní chatou **není** cílový zákazník – nepotřebuje koordinaci.

## Jádro vs. doplňky

- **Jádro:** kalendář rezervací (vč. spolucestujících), předávka (stav chaty při odjezdu → briefing při příjezdu), zásoby a nákupy, nudge upozornění s „Kopírovat pro WhatsApp“.
- **Doplňky:** chat, galerie, deník, rekonstrukce. Udržovat, nerozvíjet na úkor jádra.

## Role na chatě

Role jsou vázané na členství v chatě, ne na uživatele ([ADR-0001](adr/0001-clenstvi-uzivatel-chata.md)).

| Role | Kdo | Smí |
|---|---|---|
| správce (`admin`) | zakladatel / správce chaty | vše včetně nastavení a členů |
| člen (`user`) | dospělý z rodiny | rezervace, předávka, zásoby, doplňky, zvát hosty |
| host (`guest`) | kamarád, kterému člen půjčí chatu | jen svůj pobyt, briefing k příjezdu, vyplnění odjezdu; nevidí chat, galerii, deník, cizí rezervace, rekonstrukci; sám nerezervuje. Zve ho člen pozvánkou vázanou na rezervaci, členství vyprší 7 dní po konci pobytu. |

## Platforma

- **PWA instalovaná na plochu**, žádné App Store / Google Play (přehodnotit až u komerce). Rodina používá jen Android.
- **Mobil první:** návrh i redesign primárně pro 360–430 px, na chatě často slabý signál → offline fronta je součást jádra.
- **Jen čeština** až do rozhodnutí o komerci.
- Doména `kdynachatu.cz` (rodina = chata č. 1; registrace do 2027-02-23), hosting viz [ADR-0002](adr/0002-hosting-a-deploy.md).

## Kdy rodina „je online“ (Definition of Done návratu)

- aplikace běží na `kdynachatu.cz` z release tagu,
- funguje e-mail (reset hesla, pozvánky),
- uptime monitoring posílá alert do mobilu,
- noční záloha se ukládá mimo server,
- rodina se znovu přihlásí (nový `JWT_SECRET`) a v DB není testovací účet `admin`,
- každý dospělý z rodiny má PWA nainstalovanou na telefonu a smoke test projde **na telefonu**: přihlášení, rezervace, odjezd + předávka, nákupní seznam, chat; nic se nerozbije na 360–430 px; akce bez signálu se po připojení odešle.

## Rozhodnutí o komerci

Ke **30. 6. 2027**: (a) všechny rezervace sezóny vznikly v aplikaci, ne ve WhatsAppu, a (b) předávka je vyplněná u ≥ 70 % pobytů.
Splněno → komerční připravenost (self-service onboarding, GDPR, platby, případně i18n). Nesplněno → zjistit proč, nestavět platby.

## Vědomě ne teď

- WhatsApp bot (Cloud API / Baileys) – nejdřív ověřit, že rodina výstupy přes „Kopírovat pro WhatsApp“ opravdu sdílí.
- Pronájem (viz ADR-0003), vlastní domény a subdomény pro chaty, aplikace v obchodech, i18n, platby.
