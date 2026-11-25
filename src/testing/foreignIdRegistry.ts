/**
 * Registr referencí na cizí ID (#483): každé pole s ID (název `id`, `…Id`, `…Ids` nebo typ UUID,
 * i v poli – např. `splitWith`) ve vstupních schématech
 * `src/validators/schemas.ts` má záznam, který odkazuje na itest posílající ID z chaty B. Route takové
 * ID načítá s filtrem `cabinId` přihlášeného uživatele, cizí ID vrací 404 a nic nezapíše.
 * Meta-test `foreignIdRegistry.test.ts` (bez DB) pole čte ze schémat introspekcí Zodu, takže nové
 * pole bez záznamu shodí test a jmenuje ho. Odkaz se ověřuje: soubor existuje a obsahuje `test`
 * (úryvek názvu testu nebo jeho `describe`). Guard vidí jen pole na nejvyšší úrovni exportovaných
 * `z.object` v `schemas.ts`; ID čtené ze syrového `req.body` nebo z lokálního schématu v routě nevidí –
 * nové ID proto patří do `schemas.ts`. Vzor: `CABIN_MODEL_COVERAGE` v `integration/cabinTenantCoverage.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { integrationDir } from "./integration/cabinTenantCoverage";

/** `itest` = soubor v `src/testing/integration/`, `test` = úryvek názvu testu (nebo `describe`), který posílá cizí ID. */
export type ForeignIdEntry =
  | { itest: string; test: string; note?: string }
  | { notAReference: string };

export const FOREIGN_ID_REFERENCES: Readonly<Record<string, ForeignIdEntry>> = {
  // Rezervace
  "createReservationSchema.participantIds": { itest: "reservations.itest.ts", test: "create in A with a cabin B participant → 404, nothing created" },
  "updateReservationSchema.participantIds": { itest: "reservations.itest.ts", test: "update in A with a cabin B participant → 404, reservation unchanged" },
  "assignReservationSchema.newOwnerId": { itest: "reservations.itest.ts", test: "admin A cannot assign a cabin A reservation to a cabin B user (404)" },
  "deleteReservationSchema.id": { itest: "reservations.itest.ts", test: `["POST /delete"` },
  "reservationIdParamsSchema.id": { itest: "reservations.itest.ts", test: `["DELETE /:id"` },
  // Poznámky a chat
  "createNoteSchema.threadId": { itest: "notes.itest.ts", test: "POST /notes in A with a cabin B threadId → 404, nothing created" },
  "createNoteSchema.replyToId": { itest: "notes.itest.ts", test: "POST /notes in A with a cabin B replyToId → 404, nothing created" },
  "createMessageSchema.replyToId": { itest: "chat.itest.ts", test: "POST /api/channels/:channelId/messages with a cabin B replyToId → 404, nothing created" },
  // Nákupy a zásoby
  "createShoppingItemSchema.sourceMessageId": { itest: "shopping.itest.ts", test: "POST /shopping-list/:listId/items with a cabin B sourceMessageId → 404, nothing created" },
  "updateItemStatusSchema.splitWith": { itest: "shopping.itest.ts", test: "shopping splits: splitting with a cabin B user → 404, nothing is created" },
  "addToCartSchema.listId": { itest: "inventory.itest.ts", test: "POST /inventory/:id/add-to-cart into cabin B's list is refused and writes nothing" },
  "inventoryIdParamsSchema.id": { itest: "shopping.itest.ts", test: "Koupím já on another cabin's supply is 404, changes nothing and emits nothing" },
  // Rekonstrukce
  "createReconstructionItemSchema.sourceMessageId": { itest: "reconstruction.itest.ts", test: "POST /reconstruction with a cabin B sourceMessageId → 404, nothing created" },
  // Galerie, deník, chata
  "uploadPhotoSchema.folderId": {
    itest: "gallery.itest.ts",
    test: "POST /gallery/photos with a cabin B folderId → 404, no photo created",
    note: "Schéma popisuje multipart POST /api/gallery/photos, který `validate()` nepoužívá; route složku ověřuje sama.",
  },
  "bulkDeletePhotosSchema.photoIds": {
    itest: "gallery.itest.ts",
    test: "DELETE /gallery/photos (bulk) as",
    note: "Hromadné mazání cizí ID přeskočí (200, „Smazáno 0 fotek.“) – nic nezmění ani neprozradí.",
  },
  "createDiaryEntrySchema.folderId": { itest: "diary.itest.ts", test: "POST /diary/entries with a cabin B folderId → 404, nothing created" },
  "createDiaryEntrySchema.galleryPhotoIds": { itest: "diary.itest.ts", test: "POST /diary/entries with a cabin B galleryPhotoId → 404, nothing created" },
  "updateDiaryEntrySchema.galleryPhotoIds": { itest: "diary.itest.ts", test: "PUT /diary/entries/:id with a cabin B galleryPhotoId → 404, entry unchanged" },
  "setCabinCoverPhotoSchema.photoId": { itest: "cabinCoverPhoto.itest.ts", test: "fotka z Galerie jiné chaty → 404, žádná chata nic nedostane" },
  // Není reference na entitu
  "stagingFeedbackSchema.taskId": { notAReference: "Výčet úkolů testera (STAGING_FEEDBACK_TASK_IDS), ne ID záznamu v DB." },
};

export const isIdFieldName = (name: string): boolean => /^id$|Ids?$/.test(name);

/** UUID řetězec, i obalený do optional/nullable/default nebo pole. */
function isUuidType(schema: z.ZodType): boolean {
  let current: z.ZodType = schema;
  for (;;) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable || current instanceof z.ZodDefault) {
      current = current.unwrap() as z.ZodType;
    } else if (current instanceof z.ZodArray) {
      current = current.element as z.ZodType;
    } else {
      return current instanceof z.ZodString && current.format === "uuid";
    }
  }
}

/** `schéma.pole` pro každé pole s ID (podle názvu nebo typu UUID) v exportovaných Zod objektech modulu, abecedně. */
export function findIdFields(schemaModule: Readonly<Record<string, unknown>>): string[] {
  const fields: string[] = [];
  for (const [name, schema] of Object.entries(schemaModule)) {
    if (!(schema instanceof z.ZodObject)) continue;
    for (const [field, fieldSchema] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
      if (isIdFieldName(field) || isUuidType(fieldSchema)) fields.push(`${name}.${field}`);
    }
  }
  return fields.sort();
}

export interface ForeignIdReport {
  ok: boolean;
  /** Pole s ID bez záznamu → doplň opravu, itest a záznam. */
  missingFromRegistry: string[];
  /** Záznamy bez pole ve schématech → ukliď je. */
  staleRegistryKeys: string[];
  /** Záznamy, jejichž itest neexistuje nebo neobsahuje úryvek testu. */
  brokenLinks: string[];
}

/** Čistá logika guardu; `readItest` vrátí obsah itestu, nebo `null`, když soubor chybí. */
export function reconcileForeignIds(
  fields: readonly string[],
  registry: Readonly<Record<string, ForeignIdEntry>>,
  readItest: (file: string) => string | null,
): ForeignIdReport {
  const known = new Set(fields);
  const missingFromRegistry = fields.filter((field) => !(field in registry)).sort();
  const staleRegistryKeys = Object.keys(registry).filter((key) => !known.has(key)).sort();
  const brokenLinks = Object.entries(registry)
    .filter(([, entry]) => {
      if ("notAReference" in entry) return entry.notAReference.trim() === "";
      return !readItest(entry.itest)?.includes(entry.test);
    })
    .map(([key]) => key)
    .sort();
  return {
    ok: missingFromRegistry.length === 0 && staleRegistryKeys.length === 0 && brokenLinks.length === 0,
    missingFromRegistry,
    staleRegistryKeys,
    brokenLinks,
  };
}

export function readIntegrationFile(file: string): string | null {
  const full = path.join(integrationDir, file);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
}
