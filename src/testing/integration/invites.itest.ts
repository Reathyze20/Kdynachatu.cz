import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestUser, type TestWorld } from "./harness";

let app: Express;
let world: TestWorld;
let inviteA: { id: string; token: string };
let inviteB: { id: string; token: string };

type Call = (user: TestUser) => Promise<{ status: number }>;

async function createInvite(creator: TestUser): Promise<{ id: string; token: string }> {
  return prisma.inviteLink.create({
    data: {
      cabinId: creator.cabinId,
      createdById: creator.id,
      role: "user",
      maxUses: null,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
    select: { id: true, token: true },
  });
}

const inviteSnapshot = (id: string) => prisma.inviteLink.findUnique({ where: { id } });

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  inviteA = await createInvite(world.adminA);
  inviteB = await createInvite(world.adminB);
});

after(teardownIntegrationFile);

// ── ID endpointy: cizí (chata B) pozvánka vrací 404 a nezmění se ────────────────
// memberA (non-admin) i adminA musí dostat 404, ne 403 — 403 by přes kontrolu admin role
// prozradilo, že id je reálná pozvánka v jiné chatě (tenant kontrakt #64, precedens #133).
for (const actor of ["memberA", "adminA"] as const) {
  describe(`invites: ${actor} on a cabin B invite gets 404 and the invite is unchanged`, () => {
    const cases: [string, Call][] = [
      ["DELETE /invites/:id", (u) => as(app, u).delete(`/api/invites/${inviteB.id}`)],
      [
        "POST /invites/:id/send-email",
        (u) => as(app, u).post(`/api/invites/${inviteB.id}/send-email`).send({ email: "utocnik@example.test" }),
      ],
    ];

    for (const [name, call] of cases) {
      test(name, async () => {
        const before = await inviteSnapshot(inviteB.id);
        const res = await call(world[actor]);
        assert.equal(res.status, 404);
        assert.deepEqual(await inviteSnapshot(inviteB.id), before);
      });
    }
  });
}

describe("invites: the list for cabin A contains nothing from cabin B", () => {
  const leaks = () => [
    inviteB.id, inviteB.token, world.memberB.id, world.adminB.id,
    world.memberB.username, world.adminB.username, "Chata B",
  ];

  test("GET /api/invites", async () => {
    const res = await as(app, world.adminA).get("/api/invites");
    assert.equal(res.status, 200);
    const body = JSON.stringify(res.body);
    for (const leak of leaks()) assert.equal(body.includes(leak), false, `leaked ${leak}`);
  });

  test("GET /api/invites returns only cabin A's own invite", async () => {
    const res = await as(app, world.adminA).get("/api/invites");
    assert.deepEqual(res.body.map((i: { id: string }) => i.id), [inviteA.id]);
  });
});

describe("invites: public token endpoints are capability URLs, not cabin-scoped (by design)", () => {
  // validate/:token a accept/:token nejsou tenant-scoped — token je tajemství (kapabilní URL).
  // Netestujeme je jako 404-na-cizí-ID; jen dokládáme záměr: platný token chaty B projde
  // i z neautentizovaného kontextu (přesně proto je token náhodné tajemství).
  test("GET /api/invites/validate/:token for a cabin B token succeeds unauthenticated", async () => {
    const res = await request(app).get(`/api/invites/validate/${inviteB.token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.cabinName, "Chata B");
  });
});

describe("invites: same-cabin flows still work (positive control)", () => {
  test("admin A can create, list and delete an invite within cabin A (2xx)", async () => {
    const created = await as(app, world.adminA).post("/api/invites").send({ role: "user" });
    assert.equal(created.status, 201);
    const id: string = created.body.id;
    assert.equal((await inviteSnapshot(id))?.cabinId, world.cabinA.id);

    const list = await as(app, world.adminA).get("/api/invites");
    assert.equal(list.status, 200);
    assert.ok(list.body.some((i: { id: string }) => i.id === id));

    const removed = await as(app, world.adminA).delete(`/api/invites/${id}`);
    assert.equal(removed.status, 204);
    assert.equal(await inviteSnapshot(id), null);
  });

  test("member A (non-admin) cannot delete a cabin A invite (403 stays inside the cabin)", async () => {
    const res = await as(app, world.memberA).delete(`/api/invites/${inviteA.id}`);
    assert.equal(res.status, 403);
    assert.notEqual(await inviteSnapshot(inviteA.id), null);
  });
});
