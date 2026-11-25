import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { signAuthToken } from "../../utils/authToken";
import { ROUTE_SECURITY, type RouteAccess } from "../routeSecurityRegistry";
import { addGuests, setupIntegrationFile, teardownIntegrationFile, tokenFor, type TestWorldWithGuests } from "./harness";

// Matice rolí (#473): pro každou routu z registru ROUTE_SECURITY a každého volajícího, kterému ji
// registr nepovoluje, ověří, že odpověď není úspěšná (401/403/404). Parametry v cestě jsou skutečné
// záznamy chaty A, takže kontrola role i tenant filtr se projeví (vymyšlené id by dalo 404 vždy).
// Povolené kombinace se nevolají (zápisy by měnily data), jen u GET se hlídá, že nevrací 401/403.

type Caller = "anonymous" | "guest" | "member" | "admin" | "foreignAdmin" | "superadmin";
const CALLERS: Caller[] = ["anonymous", "guest", "member", "admin", "foreignAdmin", "superadmin"];
const DENIED = new Set([401, 403, 404]);

let app: Express;
let world: TestWorldWithGuests;
const tokens = {} as Record<Exclude<Caller, "anonymous">, string>;
/** Klíč = šablona cesty až po parametr včetně, hodnota = id záznamu chaty A. */
const ids: Record<string, string> = {};

function isAllowed(caller: Caller, access: RouteAccess, hasParams: boolean): boolean {
  if (access.includes("public")) return true;
  switch (caller) {
    case "anonymous": return false;
    case "guest": return access.includes("guest");
    case "member": return access.includes("user");
    case "admin": return access.includes("admin");
    // Správce chaty B: smí, co admin, ale na záznamy chaty A (parametry v cestě) nedosáhne.
    case "foreignAdmin": return access.includes("admin") && !hasParams;
    case "superadmin": return access.includes("superadmin");
  }
}

/** Známé výjimky: routa → volající → stav, který dnes vrací místo 401/403/404. Každá s důvodem. */
const KNOWN_EXCEPTIONS: Readonly<Record<string, Partial<Record<Caller, number>>>> = {
  // Tapety kontrolují chatu ručně: uživateli bez chaty (superadmin) vrací 400 místo 403 z requireCabin.
  "GET /api/wallpapers": { superadmin: 400 },
  "POST /api/wallpapers": { superadmin: 400 },
  "DELETE /api/wallpapers/:id": { superadmin: 400 },
  // #492: správce cizí chaty dostane 200, i když se nic nesmaže (deleteMany filtruje jeho cabinId).
  "DELETE /api/users/:id/reservations": { foreignAdmin: 200 },
};

/**
 * Tělo, které projde validací zápisových rout (Zod pole mimo schéma zahodí). Zamítnutí pak musí přijít
 * z kontroly role nebo chaty, ne z 400 za neplatný vstup. `status` má v každém schématu jiný výčet.
 */
const STATUS_BY_ROUTE: Readonly<Record<string, string>> = { "PUT /api/inventory/:id": "OK", "PUT /api/reservations/:id": "primary" };
const validBody = (route: string) => ({
  name: "Matice", message: "Matice", content: "Matice", text: "Matice", note: "Matice", title: "Matice",
  username: "matice-novy", password: "dlouhe-heslo-123", email: "matice@example.test", role: "user",
  emoji: "👍", status: "pending", category: "idea", year: 2030, month: 1, newListName: "Matice",
  startDate: "2030-02-01", endDate: "2030-02-02", newOwnerId: world.memberA.id,
  ...(STATUS_BY_ROUTE[route] && { status: STATUS_BY_ROUTE[route] }),
});

function concretePath(template: string): string {
  return template.replace(/:(\w+)/g, (match: string, _name: string, offset: number) => {
    const key = template.slice(0, offset + match.length);
    const id = ids[key];
    if (!id) throw new Error(`Matice nemá záznam pro parametr ${key} – doplň fixture v roleMatrix.itest.ts.`);
    return id;
  });
}

function call(route: string, caller: Caller) {
  const [method, template] = route.split(" ");
  const verb = method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
  const req = request(app)[verb](concretePath(template));
  if (caller !== "anonymous") req.set("Authorization", `Bearer ${tokens[caller]}`);
  return verb === "get" ? req : req.send(validBody(route));
}

before(async () => {
  const setup = await setupIntegrationFile();
  app = setup.app;
  world = await addGuests(setup.world);
  const { adminA, memberA, cabinA } = world;
  const superadmin = await prisma.user.create({
    data: { username: "superadmin", passwordHash: "x", color: "#5d9b62", email: "superadmin@example.test", isVerified: true, isEmailVerified: true, role: "admin", isSuperAdmin: true },
  });
  Object.assign(tokens, {
    guest: tokenFor(world.guestA),
    member: tokenFor(memberA),
    admin: tokenFor(adminA),
    foreignAdmin: tokenFor(world.adminB),
    superadmin: signAuthToken({ id: superadmin.id, username: superadmin.username, role: "admin", cabinId: null, isSuperAdmin: true, tokenVersion: superadmin.tokenVersion }),
  });

  const owner = { cabinId: cabinA.id };
  const day = (offset: number) => new Date(Date.UTC(2030, 0, 1 + offset));
  const thread = await prisma.noteThread.create({ data: { ...owner, name: "Vlákno A", createdById: adminA.id } });
  const note = await prisma.note.create({ data: { ...owner, userId: adminA.id, message: "Vzkaz A", threadId: thread.id } });
  const galleryFolder = await prisma.galleryFolder.create({ data: { ...owner, name: "Album A", createdById: adminA.id } });
  const photo = await prisma.galleryPhoto.create({ data: { folderId: galleryFolder.id, src: "/uploads/a.jpg", uploadedById: adminA.id } });
  const diaryFolder = await prisma.diaryFolder.create({ data: { ...owner, name: "Deník A", createdById: adminA.id } });
  const entry = await prisma.diaryEntry.create({ data: { folderId: diaryFolder.id, authorId: adminA.id, entryDate: day(0), content: "Zápis A" } });
  const item = await prisma.inventoryItem.create({ data: { ...owner, name: "Sirky A" } });
  const invite = await prisma.inviteLink.create({ data: { ...owner, createdById: adminA.id, expiresAt: day(30) } });
  const idea = await prisma.reconstructionItem.create({
    data: { ...owner, category: "idea", title: "Střecha A", description: "Střecha A", status: "pending", createdById: adminA.id },
  });
  const reservation = await prisma.reservation.create({
    data: { ...owner, userId: adminA.id, dateFrom: day(0), dateTo: day(2), purpose: "Pobyt A", status: "primary" },
  });
  const availability = await prisma.userAvailability.create({ data: { ...owner, userId: adminA.id, startDate: day(5), endDate: day(6) } });
  const list = await prisma.shoppingList.create({ data: { ...owner, name: "Nákup A", createdById: adminA.id } });
  const listItem = await prisma.shoppingListItem.create({ data: { listId: list.id, name: "Chleba A", addedById: adminA.id } });
  const wallpaper = await prisma.wallpaper.create({ data: { ...owner, url: "/uploads/wallpapers/a.jpg" } });

  Object.assign(ids, {
    "/api/channels/:id": thread.id,
    "/api/channels/:channelId": thread.id,
    "/api/note-threads/:id": thread.id,
    "/api/messages/:messageId": note.id,
    "/api/notes/:id": note.id,
    "/api/gallery/folders/:id": galleryFolder.id,
    "/api/gallery/photos/:id": photo.id,
    "/api/diary/folders/:id": diaryFolder.id,
    "/api/diary/entries/:id": entry.id,
    "/api/inventory/:id": item.id,
    "/api/invites/:id": invite.id,
    "/api/invites/validate/:token": invite.token,
    "/api/reconstruction/:id": idea.id,
    "/api/reservations/:id": reservation.id,
    "/api/reservations/:reservationId": reservation.id,
    "/api/reservations/availabilities/:id": availability.id,
    "/api/shopping-list/:listId": list.id,
    "/api/shopping-list/:itemId": listItem.id,
    "/api/shopping-lists/:id": list.id,
    "/api/superadmin/users/:id": memberA.id,
    "/api/users/:id": memberA.id,
    "/api/wallpapers/:id": wallpaper.id,
  });
});

after(teardownIntegrationFile);

describe("role matrix: a caller the registry does not allow never gets a success", () => {
  for (const [route, access] of Object.entries(ROUTE_SECURITY)) {
    test(route, async () => {
      const [method, template] = route.split(" ");
      const hasParams = template.includes(":");
      const problems: string[] = [];
      for (const caller of CALLERS) {
        const allowed = isAllowed(caller, access, hasParams);
        if (allowed && method !== "GET") continue;
        const { status } = await call(route, caller);
        if (!allowed && !DENIED.has(status) && KNOWN_EXCEPTIONS[route]?.[caller] !== status) {
          problems.push(`${caller}: ${status}, registr ho nepovoluje (čekám 401/403/404)`);
        }
        if (allowed && (status === 401 || status === 403)) {
          problems.push(`${caller}: ${status}, registr ho povoluje – oprav registr, nebo routu`);
        }
      }
      assert.deepEqual(problems, []);
    });
  }
});
