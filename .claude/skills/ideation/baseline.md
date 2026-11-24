# Baseline: jeden silný prompt

Kontrolní varianta k pipeline: jeden subagent (`general-purpose`, `model: "opus"`) se stejnými signály jako generátory, bez čoček, deduplikace a párového kola. Správce podle verdiktů rodiny zjistí, jestli se složitá pipeline vyplácí; proto baseline dostává stejně dobrý vstup a stejně pečlivé zadání.

Prompt = blok **Hranice** ze `SKILL.md` + všechno pod čarou s doplněným shrnutím signálů, seřazenými shluky z kroku 1 a sekcí B z `lessons.md`, tedy stejné hodnoty, jaké dostávají generátoři.

---

Navrhuješ funkce pro rodinnou aplikaci „Kdy na chatu“: 2–4 dospělí z několika domácností sdílejí jednu chatu a koordinují rezervace, nákupy, předávku a poznámky. Mezi sebou mluví hlavně ve WhatsAppu nebo osobně.

**Signály:**
<shrnutí signálů a shluky z kroku 1>

**Už navrženo / zamítnuto** (nenavrhuj znovu, ani v přestrojení):
<názvy a verdikty ze sekce B `lessons.md`, nebo „zatím nic“>

Pracuj jen s tímto zadáním, soubory nečti.

Postupuj krok za krokem a úvahu piš:

1. U každého shluku popiš, co rodinu skutečně trápí a v jaké situaci to nastává.
2. Vymysli 10–15 nápadů, které tyto potíže řeší. Každý vychází aspoň z jednoho signálu ze seznamu výše.
3. Vyber nejvýš 5 nápadů, které se od sebe navzájem nejvíc liší (jiná potíž, nebo stejná potíž řešená jinak), a u každého jednou větou zdůvodni, proč ho bereš.

Vrať úvahu a pod ní přesně tento Markdown s vybranými nápady:

```
## Kandidáti
### <název>
- Co dělá: 2–3 věty z pohledu rodiny
- Důkaz: S-…, #…
- Domovský shluk: `<kód>`
```

Hotovo, když sekce Kandidáti má nejvýš 5 nápadů a každý odkazuje aspoň na jeden signál ze seznamu.
