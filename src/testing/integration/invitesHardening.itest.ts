import "./env"; // musí zůstat první import
import { sentEmails } from "./mailCapture"; // před harnessem, aby e-mail.ts dostal zachytávací transport
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { as, setupIntegrationFile, teardownIntegrationFile, TEST_PASSWORD, type TestWorld } from "./harness";

// Pozvánky (#482): e-mail s pozvánkou nevloží HTML z názvu chaty ani jména zvoucího
// a pozvánka s `maxUses` nejde souběžnými požadavky použít víckrát, než dovoluje limit.

let app: Express;
let world: TestWorld;

const XSS = `<img src=x onerror="alert(1)">`;

async function createInvite(maxUses: number | null): Promise<{ id: string; token: string }> {
  return prisma.inviteLink.create({
    data: {
      cabinId: world.cabinA.id,
      createdById: world.adminA.id,
      role: "user",
      maxUses,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
    select: { id: true, token: true },
  });
}

before(async () => {
  ({ app, world } = await setupIntegrationFile());
});

beforeEach(() => {
  sentEmails.length = 0;
});

after(teardownIntegrationFile);

describe("invites: invitation e-mail escapes interpolated values", () => {
  test("cabin name and inviter name with HTML appear escaped in the e-mail", async () => {
    await prisma.cabin.update({ where: { id: world.cabinA.id }, data: { name: `Chata ${XSS}` } });
    await prisma.user.update({ where: { id: world.adminA.id }, data: { username: `Admin${XSS}` } });
    try {
      const invite = await createInvite(null);
      const res = await as(app, world.adminA).post(`/api/invites/${invite.id}/send-email`).send({ email: "host@example.test" });
      assert.equal(res.status, 200);

      assert.equal(sentEmails.length, 1);
      const { html } = sentEmails[0];
      assert.equal(html.includes("<img"), false, "raw <img> tag leaked into the e-mail HTML");
      assert.ok(html.includes("Chata &lt;img src=x onerror=&quot;alert(1)&quot;&gt;"), "cabin name is escaped");
      assert.ok(html.includes("Admin&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"), "inviter name is escaped");
    } finally {
      await prisma.cabin.update({ where: { id: world.cabinA.id }, data: { name: "Chata A" } });
      await prisma.user.update({ where: { id: world.adminA.id }, data: { username: world.adminA.username } });
    }
  });
});

describe("invites: maxUses holds under concurrent accepts", () => {
  test("N concurrent accepts of a maxUses = 1 invite create exactly one user", async () => {
    const invite = await createInvite(1);
    const N = 8;
    const usernames = Array.from({ length: N }, (_, i) => `soubezny-${i}`);

    const responses = await Promise.all(
      usernames.map((username) =>
        request(app).post(`/api/invites/accept/${invite.token}`).send({ username, password: TEST_PASSWORD }),
      ),
    );

    const statuses = responses.map((r) => r.status).sort();
    assert.equal(statuses.filter((s) => s === 201).length, 1, `statuses: ${statuses.join(",")}`);
    assert.ok(statuses.every((s) => s === 201 || s === 410), `statuses: ${statuses.join(",")}`);
    assert.equal(await prisma.user.count({ where: { username: { in: usernames } } }), 1);
    assert.equal((await prisma.inviteLink.findUniqueOrThrow({ where: { id: invite.id } })).usedCount, 1);
  });

  test("an invite without maxUses still accepts several users", async () => {
    const invite = await createInvite(null);
    for (const username of ["bez-limitu-1", "bez-limitu-2"]) {
      const res = await request(app).post(`/api/invites/accept/${invite.token}`).send({ username, password: TEST_PASSWORD });
      assert.equal(res.status, 201);
    }
    assert.equal((await prisma.inviteLink.findUniqueOrThrow({ where: { id: invite.id } })).usedCount, 2);
  });

  test("a failed account creation does not consume the invite", async () => {
    const invite = await createInvite(1);
    const taken = await request(app)
      .post(`/api/invites/accept/${invite.token}`)
      .send({ username: world.memberA.username, password: TEST_PASSWORD });
    assert.equal(taken.status, 409);
    assert.equal((await prisma.inviteLink.findUniqueOrThrow({ where: { id: invite.id } })).usedCount, 0);
  });
});
