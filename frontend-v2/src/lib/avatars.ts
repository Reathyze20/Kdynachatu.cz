/**
 * Avatar system — animal avatar definitions
 * Maps avatar IDs to their labels, SVG paths, and fallback colors.
 * Users select an avatar ID, stored in DB as `animalIcon` string.
 */

export interface AvatarDef {
  id: string;
  label: string;        // Czech display name
  src: string;          // Path to SVG in public/
  fallbackColor: string; // Background color for loading/fallback
}

export const AVATARS: AvatarDef[] = [
  { id: "liska",     label: "Liška",     src: "/avatars/liska.svg",     fallbackColor: "#E8A87C" },
  { id: "vlk",       label: "Vlk",       src: "/avatars/vlk.svg",       fallbackColor: "#B8C4D0" },
  { id: "jelen",     label: "Jelen",     src: "/avatars/jelen.svg",     fallbackColor: "#A3B18A" },
  { id: "rys",       label: "Rys",       src: "/avatars/rys.svg",       fallbackColor: "#C9A882" },
  { id: "veverka",   label: "Veverka",   src: "/avatars/veverka.svg",   fallbackColor: "#F0C5A0" },
  { id: "kralik",    label: "Králík",    src: "/avatars/kralik.svg",    fallbackColor: "#E8D5B7" },
  { id: "jezek",     label: "Ježek",     src: "/avatars/jezek.svg",     fallbackColor: "#C4A882" },
  { id: "pes",       label: "Pes",       src: "/avatars/pes.svg",       fallbackColor: "#E8C87C" },
  { id: "krava",     label: "Kráva",     src: "/avatars/krava.svg",     fallbackColor: "#D5C4B0" },
  { id: "ovce",      label: "Ovce",      src: "/avatars/ovce.svg",      fallbackColor: "#E0DDD5" },
  { id: "kun",       label: "Kůň",       src: "/avatars/kun.svg",       fallbackColor: "#C4956A" },
  { id: "slepice",   label: "Slepice",   src: "/avatars/slepice.svg",   fallbackColor: "#E8B870" },
  { id: "zaba",      label: "Žába",      src: "/avatars/zaba.svg",      fallbackColor: "#A8D5A2" },
  { id: "had",       label: "Had",       src: "/avatars/had.svg",       fallbackColor: "#8BB88B" },
  { id: "lev",       label: "Lev",       src: "/avatars/lev.svg",       fallbackColor: "#D4B070" },
  { id: "tygr",      label: "Tygr",      src: "/avatars/tygr.svg",      fallbackColor: "#E8A050" },
  { id: "slon",      label: "Slon",      src: "/avatars/slon.svg",      fallbackColor: "#B0BEC5" },
  { id: "panda",     label: "Panda",     src: "/avatars/panda.svg",     fallbackColor: "#D5D5D0" },
  { id: "koala",     label: "Koala",     src: "/avatars/koala.svg",     fallbackColor: "#B8B0A8" },
  { id: "klokan",    label: "Klokan",    src: "/avatars/klokan.svg",    fallbackColor: "#C4956A" },
  { id: "zebra",     label: "Zebra",     src: "/avatars/zebra.svg",     fallbackColor: "#E0E0E0" },
  { id: "zirafa",    label: "Žirafa",    src: "/avatars/zirafa.svg",    fallbackColor: "#E8C87C" },
  { id: "surikata",  label: "Surikata",  src: "/avatars/surikata.svg",  fallbackColor: "#D4B896" },
];

/** Map for O(1) lookups by ID */
const AVATAR_MAP = new Map(AVATARS.map((a) => [a.id, a]));

/**
 * Older accounts stored the English avatar name (from before the ID rename
 * to Czech). Without this alias, `getAvatarById("fox")` returns undefined
 * and the raw string leaks into the UI instead of an icon.
 */
const LEGACY_ID_ALIASES: Record<string, string> = {
  fox: "liska", wolf: "vlk", deer: "jelen", lynx: "rys", squirrel: "veverka",
  rabbit: "kralik", hedgehog: "jezek", dog: "pes", cow: "krava", sheep: "ovce",
  horse: "kun", chicken: "slepice", frog: "zaba", snake: "had", lion: "lev",
  tiger: "tygr", elephant: "slon", panda: "panda", koala: "koala",
  kangaroo: "klokan", zebra: "zebra", giraffe: "zirafa", meerkat: "surikata",
};

function resolveId(id: string): string {
  return AVATAR_MAP.has(id) ? id : (LEGACY_ID_ALIASES[id] ?? id);
}

/** Get avatar definition by ID. Returns undefined for unknown IDs. */
export function getAvatarById(id: string | null | undefined): AvatarDef | undefined {
  if (!id) return undefined;
  return AVATAR_MAP.get(resolveId(id));
}

/**
 * Check if a value is a new-style avatar ID (e.g. "fox")
 * vs old-style emoji (e.g. "🦊").
 */
export function isAvatarId(value: string | null | undefined): boolean {
  if (!value) return false;
  return AVATAR_MAP.has(resolveId(value));
}
