/**
 * Kalendář akcí Kudy z nudy pro kraj chaty (#283). Nic se nestahuje: appka jen složí odkaz
 * a ven pošle jediný údaj, kraj (ADR-0006).
 *
 * Klíče jsou názvy krajů z číselníku RÚIAN, jak je ukládá výběr obce (#279, `municipalityRegion`).
 * Slugy jsou ručně ověřené na https://www.kudyznudy.cz/kalendar-akci/<slug> (2026-11-23);
 * neplatný slug tam vrací 404.
 */
const KUDY_Z_NUDY_REGION_SLUGS = new Map(Object.entries({
  "Hlavní město Praha": "hlavni-mesto-praha",
  "Středočeský kraj": "stredocesky-kraj",
  "Jihočeský kraj": "jihocesky-kraj",
  "Plzeňský kraj": "plzensky-kraj",
  "Karlovarský kraj": "karlovarsky-kraj",
  "Ústecký kraj": "ustecky-kraj",
  "Liberecký kraj": "liberecky-kraj",
  "Královéhradecký kraj": "kralovehradecky-kraj",
  "Pardubický kraj": "pardubicky-kraj",
  "Kraj Vysočina": "kraj-vysocina",
  "Jihomoravský kraj": "jihomoravsky-kraj",
  "Olomoucký kraj": "olomoucky-kraj",
  "Zlínský kraj": "zlinsky-kraj",
  "Moravskoslezský kraj": "moravskoslezsky-kraj",
}));

/** Odkaz na kalendář akcí v kraji, nebo null, když chata nemá vybranou obec (nebo kraj neznáme). */
export function regionEventsUrl(region: string | null | undefined): string | null {
  const slug = region ? KUDY_Z_NUDY_REGION_SLUGS.get(region) : undefined;
  return slug ? `https://www.kudyznudy.cz/kalendar-akci/${slug}` : null;
}
