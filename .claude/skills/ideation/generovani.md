# Krok 2: Nezávislé generování

## Generátory

| Čočka | `opus` | `sonnet` |
|---|---|---|
| pevná | G1 (čočka 1), G3 (čočka 3) | G2 (čočka 2), G4 (čočka 4) |
| shluk (1 = největší) | G6 (shluk 2), G8 (shluk 4) | G5 (shluk 1), G7 (shluk 3) |

Když je shluků méně než 4, generátor bez shluku `G(4+i)` dostane pevnou čočku `i`. Tatáž pevná čočka tak běží i na druhém modelu a počet generátorů zůstává 8.

Generátory G1–G8 spouštěj jako subagenty `general-purpose` s parametrem `model` podle tabulky, všechny v jedné zprávě.

**Volitelná větev Codex:** když `command -v codex` něco vrátí, G4 a G8 neběží jako subagenti, ale přes Codex. Prompt zapiš do `<kořen>/runs/codex-G4.txt` (`codex-G8.txt`), spusť na pozadí `codex exec -s read-only "$(cat <soubor>)" < /dev/null` a po doběhnutí soubor smaž. Když `codex` dostupné není, větev tiše přeskoč a G4 a G8 běží podle tabulky.

## Pevné čočky

1. **Předávka v první hodině po příjezdu.** Rodina právě dorazila na chatu. Co potřebuje vědět a udělat v první hodině, aby plynule navázala na předchozí návštěvu?
2. **Nejméně technický člen rodiny na telefonu se slabým signálem.** Starší telefon, jedna čárka signálu, žádná trpělivost s formuláři. Co mu ušetří telefonát nebo dotaz ve WhatsAppu?
3. **Správce mimo sezónu.** Listopad až březen, na chatě nikdo. Co správce potřebuje vědět a zařídit, aby jaro nezačalo překvapením?
4. **Ubrat jeden krok ve WhatsAppu, nepřidat obrazovku.** Najdi koordinaci, která dnes stojí několik zpráv ve WhatsAppu, a zkrať ji o jeden krok bez nové obrazovky v aplikaci.

## Čočka ze shluku

> **Shluk `<kód>` – <potíž>.** Signály: <seznam>. Představ si, že tahle potíž je jediná věc, kterou smíš v aplikaci zlepšit.

## Prompt generátoru

Blok **Hranice** ze `SKILL.md`, pak tento text s doplněnými hodnotami. Z `lessons.md` dostává generátor jen sekci B; výtky ze sekce A by ho tlačily k opatrnému průměru.

---

Navrhuješ funkce pro rodinnou aplikaci „Kdy na chatu“: 2–4 dospělí z několika domácností sdílejí jednu chatu a koordinují rezervace, nákupy, předávku a poznámky. Mezi sebou mluví hlavně ve WhatsAppu nebo osobně.

**Tvoje čočka:** <čočka>

**Signály:**
<shrnutí signálů a shluky z kroku 1>

**Už navrženo / zamítnuto** (nenavrhuj znovu, ani v přestrojení):
<názvy a verdikty ze sekce B `lessons.md`, nebo „zatím nic“>

Pracuj jen s tímto zadáním, soubory nečti.

Vygeneruj 5 nápadů jako vzorek z **celého rozdělení** možných odpovědí, ne jen ty nejpravděpodobnější. U každého nejdřív krátce uvaž, proč by pomohl právě v situaci tvé čočky, pak uveď pravděpodobnost `p` (0–1), s jakou bys tento nápad na takové zadání typicky navrhl. Aspoň 2 nápady mají `p` pod 0,10. Každý nápad vychází aspoň z jednoho signálu ze seznamu výše.

Vrať 5× tento blok:

```
### <n>. <název>
- Úvaha: 2–4 věty
- Co dělá: 2–3 věty z pohledu rodiny
- Signály: S-…, #…
- p: 0,xx
```
