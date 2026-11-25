import "./env"; // musí zůstat první import
import { sentEmails } from "./mailCapture"; // před harnessem, aby e-mail.ts dostal zachytávací transport
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import prisma from "../../utils/prisma";
import { hashPassword } from "../../utils/password";
import { as, setupIntegrationFile, teardownIntegrationFile, TEST_PASSWORD, type TestUser, type TestWorld } from "./harness";

// Změna e-mailu v profilu chce současné heslo (#475): ukradený token nestačí na to, aby si útočník
// nastavil vlastní adresu a pak přes reset hesla převzal účet. Stará adresa dostane upozornění.

let app: Express;
let world: TestWorld;
let counter = 0;

/** Člen chaty A s vlastní adresou `<jméno>@example.test` (e-mail je unikátní), nebo bez e-mailu. */
async function createMember(withEmail = true): Promise<TestUser & { email: string | null }> {
  const username = `clen-email-${++counter}`;
  const email = withEmail ? `${username}@example.test` : null;
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(TEST_PASSWORD),
      color: "#5d9b62",
      email,
      isEmailVerified: true,
      isVerified: true,
      role: "user",
      cabinId: world.cabinA.id,
    },
  });
  return { id: user.id, username, role: "user", cabinId: world.cabinA.id, email };
}

const emailOf = async (user: TestUser) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } })).email;

before(async () => {
  ({ app, world } = await setupIntegrationFile());
});

beforeEach(() => {
  sentEmails.length = 0;
});

after(teardownIntegrationFile);

describe("PATCH /api/users/me: changing the e-mail requires the current password", () => {
  const refused: [string, Record<string, unknown>][] = [
    ["without a password", { email: "utocnik@example.test" }],
    ["with an empty password", { email: "utocnik@example.test", currentPassword: "" }],
    ["with a wrong password", { email: "utocnik@example.test", currentPassword: "spatne-heslo-123" }],
    ["removing the e-mail without a password", { email: null }],
  ];

  for (const [name, body] of refused) {
    test(`${name} → 403, the e-mail stays and nothing is sent`, async () => {
      const member = await createMember();

      const res = await as(app, member).patch("/api/users/me").send(body);

      assert.equal(res.status, 403);
      assert.match(res.body.message, /heslo/i);
      assert.equal(await emailOf(member), member.email);
      assert.equal(sentEmails.length, 0);
    });
  }

  test("a user without an e-mail cannot set one without the password (no reset-password takeover)", async () => {
    const member = await createMember(false);

    const res = await as(app, member).patch("/api/users/me").send({ email: "utocnik@example.test" });

    assert.equal(res.status, 403);
    assert.equal(await emailOf(member), null);
  });

  test("a refused e-mail change saves no other field of the same request either", async () => {
    const member = await createMember();

    const res = await as(app, member).patch("/api/users/me").send({ email: "utocnik@example.test", color: "#abcdef" });

    assert.equal(res.status, 403);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    assert.equal(user.email, member.email);
    assert.equal(user.color, "#5d9b62");
  });

  test("with the right password the e-mail changes and the old address gets a notice", async () => {
    const member = await createMember();

    const res = await as(app, member)
      .patch("/api/users/me")
      .send({ email: "nova@example.test", currentPassword: TEST_PASSWORD });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, "nova@example.test");
    assert.equal(await emailOf(member), "nova@example.test");
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, member.email);
    assert.match(sentEmails[0].subject, /e-mail/i);
    assert.ok(sentEmails[0].html.includes("nova@example.test"), "upozornění řekne, na jakou adresu se e-mail změnil");
    assert.ok(!JSON.stringify(res.body).includes(TEST_PASSWORD), "heslo se nevrací v odpovědi");
  });

  test("with the right password a user without an e-mail sets one, no notice goes anywhere", async () => {
    const member = await createMember(false);

    const res = await as(app, member)
      .patch("/api/users/me")
      .send({ email: "prvni@example.test", currentPassword: TEST_PASSWORD });

    assert.equal(res.status, 200);
    assert.equal(await emailOf(member), "prvni@example.test");
    assert.equal(sentEmails.length, 0);
  });
});

describe("PATCH /api/users/me: other profile fields do not need the password", () => {
  test("colour and animal icon save without a password and send nothing", async () => {
    const res = await as(app, world.memberA).patch("/api/users/me").send({ color: "#123456", animalIcon: "fox" });

    assert.equal(res.status, 200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: world.memberA.id } });
    assert.equal(user.color, "#123456");
    assert.equal(user.animalIcon, "fox");
    assert.equal(sentEmails.length, 0);
  });

  test("sending the unchanged e-mail along with other fields does not need the password", async () => {
    const member = await createMember();

    const res = await as(app, member).patch("/api/users/me").send({ email: member.email, color: "#654321" });

    assert.equal(res.status, 200);
    assert.equal(await emailOf(member), member.email);
    assert.equal(sentEmails.length, 0);
  });
});
