/**
 * Count-check reconciliation for the backup migration path.
 *
 * `compareCounts` is a pure function: given a row-count snapshot taken before a
 * migration step and one taken after, it reports whether every entity still has
 * the same number of rows. It is the safety net for the rehearsal in
 * `migrationRehearsalSmoke.ts` — restore and `backfillCabin` must never drop,
 * duplicate, or silently skip rows.
 *
 * Kept free of any database or Prisma dependency so it can be unit-tested with
 * `node:test` (see `migrationCountCheck.test.ts`).
 */

/** A map of entity key → row count, e.g. `{ users: 4, reservations: 12 }`. */
export type CountSnapshot = Record<string, number>;

/** A single entity whose before/after counts disagree. `null` = absent from that snapshot. */
export interface CountMismatch {
  entity: string;
  before: number | null;
  after: number | null;
}

export interface CountCheckReport {
  ok: boolean;
  mismatches: CountMismatch[];
}

/**
 * The canonical set of entities the migration reconciles, with the Postgres
 * table that backs each one (`@@map` names from `prisma/schema.prisma`). The
 * rehearsal smoke iterates this list to build its before/after snapshots.
 */
export const MIGRATION_COUNT_ENTITIES: ReadonlyArray<{ entity: string; table: string }> = [
  { entity: "users", table: "users" },
  { entity: "reservations", table: "reservations" },
  { entity: "shoppingItems", table: "shopping_list_items" },
  { entity: "noteThreads", table: "note_threads" },
  { entity: "notes", table: "notes" },
  { entity: "gallery", table: "gallery_photos" },
  { entity: "diary", table: "diary_entries" },
  { entity: "reconstructionItems", table: "reconstruction_items" },
  { entity: "inventoryItems", table: "inventory_items" },
];

/**
 * Compare two count snapshots. Equal counts for every entity → `ok: true`.
 * Any difference — including an entity present in one snapshot but not the
 * other — is reported as a concrete mismatch. Mismatches are sorted by entity
 * name so the report is stable regardless of snapshot key order.
 */
export function compareCounts(before: CountSnapshot, after: CountSnapshot): CountCheckReport {
  const entities = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  const mismatches: CountMismatch[] = [];

  for (const entity of [...entities].sort()) {
    const beforeCount = Object.prototype.hasOwnProperty.call(before, entity) ? before[entity] : null;
    const afterCount = Object.prototype.hasOwnProperty.call(after, entity) ? after[entity] : null;

    if (beforeCount !== afterCount) {
      mismatches.push({ entity, before: beforeCount, after: afterCount });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}
