/**
 * Omezení `context` v klientském chybovém reportu (`POST /api/logs/client[/anon]`), aby jeden
 * request nemohl zapsat do logu libovolně velký objekt. Velký context se neodmítá, ořízne se:
 * report chyby má cenu i bez kompletního kontextu. Oříznutá místa jsou označená `…`.
 */

export const CLIENT_LOG_CONTEXT_LIMITS = {
  /** Klíčů v jednom objektu i položek v jednom poli. */
  maxKeys: 20,
  /** Úrovní vnořených objektů/polí pod samotným contextem. */
  maxDepth: 3,
  /** Znaků v jedné textové hodnotě i v názvu klíče. */
  maxStringLength: 500,
  /** Znaků celého contextu po serializaci do JSON (bez obálky `{ truncated, preview }`). */
  maxTotalLength: 4000,
} as const;

const { maxKeys, maxDepth, maxStringLength, maxTotalLength } = CLIENT_LOG_CONTEXT_LIMITS;

const boundString = (value: string) => (value.length > maxStringLength ? `${value.slice(0, maxStringLength)}…` : value);

function boundValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return boundString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > maxDepth) return "[…]";

  if (Array.isArray(value)) {
    const items = value.slice(0, maxKeys).map((item) => boundValue(item, depth + 1));
    return value.length > maxKeys ? [...items, `… +${value.length - maxKeys}`] : items;
  }

  const entries = Object.entries(value);
  // Object.fromEntries zakládá vlastní vlastnosti, takže klíč `__proto__` z JSON nemění prototyp.
  const bounded: Record<string, unknown> = Object.fromEntries(
    entries.slice(0, maxKeys).map(([key, item]) => [boundString(key), boundValue(item, depth + 1)]),
  );
  if (entries.length > maxKeys) bounded["…"] = `+${entries.length - maxKeys} klíčů`;
  return bounded;
}

export function boundClientLogContext(context: Record<string, unknown>): Record<string, unknown> {
  const bounded = boundValue(context, 0) as Record<string, unknown>;
  const json = JSON.stringify(bounded);
  return json.length <= maxTotalLength ? bounded : { truncated: true, preview: json.slice(0, maxTotalLength) };
}
