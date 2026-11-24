import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import type { Prisma } from "../../generated/prisma/client.js";
import { calendarTodayIso, nextFreeWeekend } from "../../backend/routes/reservationHelpers";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

// Tenant kontrakt souhrnů na přehledu `/api/dashboard/*` (#408): seznamy, počty a souhrny pro
// chatu A neobsahují nic z chaty B. Všechny fixtures vzniknou v `before` a testy jen čtou, takže
// se očekávané hodnoty dají napsat přesně. Chata B má ke každému souhrnu záznam, který by se pro
// A při chybějícím filtru `cabinId` ukázal; kontrolní testy ověřují, že ho B opravdu vidí.

let app: Express;
let world: TestWorld;
let todayIso: string;
const ids = {} as Record<
  "ownUpcoming" | "bUpcoming" | "bBlocking" | "bLastStay" | "movedDeparting" | "movedNext" | "aItem" | "bItem" |
  "aNote" | "bNote" | "aIdea" | "bIdea" | "aPhoto" | "bPhoto",
  string
>;

const DAY_MS = 86_400_000;
const day = (offset: number) => new Date(new Date(todayIso).getTime() + offset * DAY_MS);

type ReservationExtra = Partial<Prisma.ReservationUncheckedCreateInput>;

const createReservation = async (owner: TestUser, cabinId: string, dateFrom: Date, dateTo: Date, extra: ReservationExtra = {}) =>
  (await prisma.reservation.create({
    data: { userId: owner.id, cabinId, dateFrom, dateTo, purpose: `Pobyt ${owner.username}`, status: "primary", ...extra },
  })).id;

async function seedShopping(owner: TestUser, name: string): Promise<string> {
  const list = await prisma.shoppingList.create({ data: { name: `Nákup ${name}`, createdById: owner.id, cabinId: owner.cabinId } });
  const item = await prisma.shoppingListItem.create({ data: { listId: list.id, name, addedById: owner.id, isEssential: true } });
  return item.id;
}

const seedNote = async (owner: TestUser, message: string) =>
  (await prisma.note.create({ data: { userId: owner.id, cabinId: owner.cabinId, message } })).id;

const seedIdea = async (owner: TestUser, title: string) =>
  (await prisma.reconstructionItem.create({
    data: { category: "idea", title, description: title, status: "pending", createdById: owner.id, cabinId: owner.cabinId },
  })).id;

async function seedPhoto(owner: TestUser, name: string): Promise<string> {
  const folder = await prisma.galleryFolder.create({ data: { name: `Album ${name}`, createdById: owner.id, cabinId: owner.cabinId } });
  const photo = await prisma.galleryPhoto.create({ data: { folderId: folder.id, src: `/uploads/${name}.jpg`, uploadedById: owner.id } });
  return photo.id;
}

const seedInvite = (owner: TestUser) =>
  prisma.inviteLink.create({ data: { cabinId: owner.cabinId, createdById: owner.id, expiresAt: day(30) } });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  todayIso = calendarTodayIso(new Date());
  const { adminA, memberA, memberB, cabinB } = world;

  // Chata A: jediná rezervace, daleko v budoucnu, s dokončenou předávkou a závadou. Vyplnil ji
  // uživatel z chaty B, jeho jméno se ale v A ukázat nesmí (autor se hledá jen mezi členy A).
  ids.ownUpcoming = await createReservation(adminA, adminA.cabinId, day(900), day(900), {
    isCheckoutCompleted: true, checkoutCompletedBy: memberB.id, checkoutCompletedAt: new Date(), checkoutStateAt: new Date(),
    checkoutState: { broken: "Prasklé okno" },
  });

  // Chata B: blízký pobyt, pobyt od dneška přes všech 26 hledaných víkendů a pobyt, který skončil včera.
  ids.bUpcoming = await createReservation(memberB, cabinB.id, day(10), day(12));
  ids.bBlocking = await createReservation(memberB, cabinB.id, day(0), day(200));
  ids.bLastStay = await createReservation(memberB, cabinB.id, day(-3), day(-1));

  // Člen A, který dřív byl v chatě B: jeho staré rezervace zůstaly v B. Souhrny „moje“ v A je nesmí
  // počítat. Pobyt od 1. ledna do dneška: dnešní odjezd i noci letos. 1. ledna začne včera, ať
  // nespadne mezi nadcházející pobyty B (noci letos pak kontrolovat nejde).
  const yearStart = new Date(`${todayIso.slice(0, 4)}-01-01`);
  ids.movedDeparting = await createReservation(memberA, cabinB.id, yearStart < day(0) ? yearStart : day(-1), day(0));
  ids.movedNext = await createReservation(memberA, cabinB.id, day(30), day(32));

  ids.aItem = await seedShopping(memberA, "Sirky A");
  ids.bItem = await seedShopping(memberB, "Sirky B");
  ids.aNote = await seedNote(memberA, "Vzkaz A");
  ids.bNote = await seedNote(memberB, "Vzkaz B");
  ids.aIdea = await seedIdea(memberA, "Nová střecha A");
  ids.bIdea = await seedIdea(memberB, "Nová střecha B");
  ids.aPhoto = await seedPhoto(memberA, "fotka-a");
  ids.bPhoto = await seedPhoto(memberB, "fotka-b");
  await seedInvite(adminA);
  await seedInvite(world.adminB);
});

after(teardownIntegrationFile);

const dashboardGet = async (user: TestUser, path: string) => {
  const res = await as(app, user).get(`/api/dashboard/${path}`);
  assert.equal(res.status, 200);
  return res.body;
};

const idsOf = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("dashboard: GET /reservations for cabin A summarises only cabin A", () => {
  test("upcoming, active, last stay and stays this month contain nothing from cabin B", async () => {
    const body = await dashboardGet(world.memberA, "reservations");
    assert.deepEqual(idsOf(body.upcomingReservations), [ids.ownUpcoming]);
    assert.equal(body.activeReservation, null);
    assert.equal(body.lastStay, null);
    assert.equal(body.stats.totalStaysThisMonth, 0);
  });

  test("the next free weekend ignores cabin B's stays", async () => {
    const body = await dashboardGet(world.memberA, "reservations");
    assert.deepEqual(body.nextFreeWeekend, nextFreeWeekend(todayIso, []));
  });

  test("my departure, next stay and nights skip my old reservations left in cabin B", async () => {
    const body = await dashboardGet(world.memberA, "reservations");
    assert.equal(body.departingToday, false);
    assert.equal(body.departingReservationId, null);
    assert.equal(body.myNextReservation, null);
    assert.equal(body.stats.myNightsThisYear, 0);
  });

  test("the last fault names the stay owner, not the cabin B user who filled the handover", async () => {
    const body = await dashboardGet(world.memberA, "reservations");
    assert.equal(body.lastFault.text, "Prasklé okno");
    assert.equal(body.lastFault.reportedBy, world.adminA.username);
    assert.equal(JSON.stringify(body).includes(world.memberB.username), false);
  });

  test("control: cabin B sees its own stays", async () => {
    const body = await dashboardGet(world.memberB, "reservations");
    assert.deepEqual(idsOf(body.upcomingReservations), [ids.bBlocking, ids.bUpcoming, ids.movedNext]);
    assert.ok([ids.bBlocking, ids.movedDeparting].includes(body.activeReservation.id));
    assert.equal(body.lastStay.username, world.memberB.username);
    assert.equal(body.nextFreeWeekend, null);
    // Pobyt přes celý měsíc a pobyt od 1. ledna do dneška; ostatní podle data spuštění
    assert.ok(body.stats.totalStaysThisMonth >= 2);
  });
});

describe("dashboard: other summaries for cabin A contain nothing from cabin B", () => {
  test("GET /shopping", async () => {
    const body = await dashboardGet(world.memberA, "shopping");
    assert.deepEqual(idsOf(body.pendingShoppingItems), [ids.aItem]);
    assert.equal(body.totalPendingShoppingCount, 1);
    assert.equal(body.totalItemsCount, 1);
    assert.deepEqual(body.essentialWarning, { count: 1, items: [{ id: ids.aItem, name: "Sirky A" }] });
    assert.equal(JSON.stringify(body).includes(ids.bItem), false);
  });

  test("GET /notes", async () => {
    assert.deepEqual(idsOf((await dashboardGet(world.memberA, "notes")).latestNotes), [ids.aNote]);
  });

  test("GET /reconstruction", async () => {
    const body = await dashboardGet(world.memberA, "reconstruction");
    assert.deepEqual(idsOf(body.items), [ids.aIdea]);
    assert.equal(body.totalActiveCount, 1);
  });

  test("GET /gallery", async () => {
    assert.deepEqual(idsOf((await dashboardGet(world.memberA, "gallery")).photos), [ids.aPhoto]);
  });

  test("GET /activation counts only cabin A for its admin", async () => {
    assert.deepEqual(await dashboardGet(world.adminA, "activation"), {
      shouldShow: false,
      membersCount: 2,
      activeInviteCount: 1,
      reservationsCount: 1,
      shoppingListsCount: 1,
      completedCount: 3,
      totalCount: 3,
    });
  });

  test("control: cabin B sees its own records", async () => {
    const { memberB, adminB } = world;
    assert.deepEqual(idsOf((await dashboardGet(memberB, "shopping")).pendingShoppingItems), [ids.bItem]);
    assert.deepEqual(idsOf((await dashboardGet(memberB, "notes")).latestNotes), [ids.bNote]);
    assert.deepEqual(idsOf((await dashboardGet(memberB, "reconstruction")).items), [ids.bIdea]);
    assert.deepEqual(idsOf((await dashboardGet(memberB, "gallery")).photos), [ids.bPhoto]);
    assert.equal((await dashboardGet(adminB, "activation")).reservationsCount, 5);
  });
});
