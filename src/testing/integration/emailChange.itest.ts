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

/** Člen chaty A s unikátní adresou `<jméno>@example.test`, nebo bez e-mailu. */
async function createMember(withEmail = true): Promise<TestUser & { email: string | null }> {
  const username = `clen-email-${++counter}`;
  const email = withEmail ? `${username}@example.test` : null;
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const base = { username, role: "user", cabinId: world.cabinA.id } as const;
  const user = await prisma.user.create({ data: { ...base, passwordHash, color: "#5d9b62", email, isEmailVerified: true, isVerified: true } });
  return { ...base, id: user.id, email };
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

const patchMe = (user: TestUser, body: Record<string, unknown>) => as(app, user).patch("/api/users/me").send(body);

describe("PATCH /api/users/me: changing the e-mail requires the current password", () => {
  const attacker = "utocnik@example.test";
  const refused: [string, boolean, Record<string, unknown>][] = [
    ["without a password", true, { email: attacker }],
    ["with an empty password", true, { email: attacker, currentPassword: "" }],
    ["with a wrong password", true, { email: attacker, currentPassword: "spatne-heslo-123" }],
    ["removing the e-mail without a password", true, { email: null }],
    ["setting a first e-mail without a password (no reset-password takeover)", false, { email: attacker }],
    ["with other fields in the same request", true, { email: attacker, color: "#abcdef" }],
  ];

  for (const [name, withEmail, body] of refused) {
    test(`${name} → 403, nothing is saved and nothing is sent`, async () => {
      const member = await createMember(withEmail);
      const res = await patchMe(member, body);
      assert.equal(res.status, 403);
      assert.match(res.body.message, /heslo/i);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
      assert.equal(user.email, member.email);
      assert.equal(user.color, "#5d9b62");
      assert.equal(sentEmails.length, 0);
    });
  }

  test("with the right password the e-mail changes and the old address gets a notice", async () => {
    const member = await createMember();
    const res = await patchMe(member, { email: "nova@example.test", currentPassword: TEST_PASSWORD });
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
    const res = await patchMe(member, { email: "prvni@example.test", currentPassword: TEST_PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(await emailOf(member), "prvni@example.test");
    assert.equal(sentEmails.length, 0);
  });
});

describe("PATCH /api/users/me: other profile fields do not need the password", () => {
  test("colour and icon save without a password, also with the unchanged e-mail, and send nothing", async () => {
    const member = await createMember();
    const res = await patchMe(member, { email: member.email, color: "#123456", animalIcon: "fox" });
    assert.equal(res.status, 200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
    assert.deepEqual([user.email, user.color, user.animalIcon], [member.email, "#123456", "fox"]);
    assert.equal(sentEmails.length, 0);
  });
});
