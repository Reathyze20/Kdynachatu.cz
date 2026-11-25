import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import { io as connectClient, type Socket } from "socket.io-client";
import prisma from "../../utils/prisma";
import { hashPassword } from "../../utils/password";
import { addGuests, as, setupIntegrationFile, teardownIntegrationFile, tokenFor, TEST_PASSWORD, type TestUser, type TestWorldWithGuests } from "./harness";

// Socket handshake (#486): uživatel z DB, host mimo room chaty, zneplatnění relací odpojí. Skutečný server i klient, žádné mocky.

let app: Express;
let server: Server;
let world: TestWorldWithGuests;
let url: string;
const openSockets: Socket[] = [];

/** Připojí socket; odmítnutý handshake vyhodí chybu se zprávou serveru. */
function connect(token: string): Promise<Socket> {
  const socket = connectClient(url, { path: "/ws", auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
  openSockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (const deadline = Date.now() + 2000; !predicate(); await new Promise((resolve) => setTimeout(resolve, 10))) {
    if (Date.now() > deadline) throw new Error(`Nedočkali jsme se: ${label}`);
  }
}

/** Texty zpráv z událostí `message:created`, které socket dostal. */
function record(socket: Socket): string[] {
  const received: string[] = [];
  socket.on("message:created", (data: { message: string }) => received.push(data.message));
  return received;
}
const listen = async (token: string) => record(await connect(token));

let counter = 0;
/** Pošle zprávu do chaty autora a počká, až dorazí kontrolnímu socketu téže chaty (+ rezerva pro ostatní). */
async function postMessageAndWait(author: TestUser, control: string[]): Promise<string> {
  const message = `zprava-${++counter}`;
  assert.equal((await as(app, author).post("/api/channels/messages").send({ message })).status, 201);
  await waitFor(() => control.includes(message), `kontrolní socket dostal ${message}`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return message;
}

async function createMember(isSuperAdmin = false): Promise<TestUser> {
  const username = `socket-${++counter}`;
  const user = await prisma.user.create({
    data: { username, passwordHash: await hashPassword(TEST_PASSWORD), color: "#5d9b62", email: `${username}@example.test`,
      isEmailVerified: true, isVerified: true, role: "user", cabinId: world.cabinA.id, isSuperAdmin },
  });
  return { id: user.id, username, role: user.role, cabinId: world.cabinA.id, tokenVersion: user.tokenVersion };
}

before(async () => {
  const setup = await setupIntegrationFile();
  ({ app, server } = setup);
  world = await addGuests(setup.world);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  openSockets.forEach((socket) => socket.disconnect());
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await teardownIntegrationFile();
});

describe("socket handshake loads the user from the DB (#486)", () => {
  test("banned, deleted and stale-tokenVersion users do not connect; a current member does", async () => {
    const [banned, deleted, stale] = [await createMember(), await createMember(), await createMember()];
    const tokens = { banned: tokenFor(banned), deleted: tokenFor(deleted), stale: tokenFor(stale) };
    await prisma.user.update({ where: { id: banned.id }, data: { isBanned: true } });
    await prisma.user.delete({ where: { id: deleted.id } });
    await prisma.user.update({ where: { id: stale.id }, data: { tokenVersion: { increment: 1 } } });

    for (const [label, token] of Object.entries(tokens)) {
      await assert.rejects(connect(token), `${label}: handshake má být odmítnutý`);
    }
    assert.equal((await connect(tokenFor(world.memberA))).connected, true);
  });

  test("a token claiming another cabin gets events of the cabin from the DB only", async () => {
    const controlA = await listen(tokenFor(world.adminA));
    const controlB = await listen(tokenFor(world.adminB));
    // Token člena A s cabinId chaty B a rolí admin – server musí obojí vzít z DB.
    const spoofed = await listen(tokenFor({ ...world.memberA, cabinId: world.cabinB.id, role: "admin" }));

    await postMessageAndWait(world.memberB, controlB);
    const fromA = await postMessageAndWait(world.adminA, controlA);

    assert.deepEqual(spoofed, [fromA], "jen zprávy chaty A (podle DB), nic z chaty B");
  });

  test("a guest does not get cabin events, even with a token claiming a member role", async () => {
    const control = await listen(tokenFor(world.adminA));
    const guest = await listen(tokenFor(world.guestA));
    const guestClaimingMember = await listen(tokenFor({ ...world.guestA, role: "user" }));

    await postMessageAndWait(world.memberA, control);

    assert.deepEqual(guest, [], "host nedostane zprávu z chaty");
    assert.deepEqual(guestClaimingMember, [], "role se bere z DB, ne z tokenu");
  });
});

describe("revoking sessions disconnects live sockets (#486)", () => {
  type Revoke = (victim: TestUser) => Promise<{ status: number }>;
  const events: [string, Revoke, tokenStaysValid?: boolean][] = [
    ["ban by the superadmin", async (victim) => as(app, await createMember(true)).patch(`/api/superadmin/users/${victim.id}/ban`)],
    ["removal from the cabin", (victim) => as(app, world.adminA).patch(`/api/users/${victim.id}/remove-from-cabin`).send({ deleteData: false })],
    ["own password change", (victim) => as(app, victim).patch("/api/users/me/password").send({ oldPassword: TEST_PASSWORD, newPassword: "nove-heslo-486-abc" })],
    ["log out everywhere", (victim) => as(app, victim).post("/api/users/me/logout-all").send({})],
    // Odchod z chaty relace neruší (token zůstává platný), socket ale nesmí zůstat v roomu chaty.
    ["leaving the cabin", (victim) => as(app, victim).post("/api/users/me/leave-cabin"), true],
  ];

  for (const [name, revoke, tokenStaysValid] of events) {
    test(name, async () => {
      const victim = await createMember();
      const oldToken = tokenFor(victim);
      const control = await listen(tokenFor(world.adminA));
      const bystander = await connect(tokenFor(world.memberA));
      const victimSocket = await connect(oldToken);
      const received = record(victimSocket);
      let reason: string | null = null;
      victimSocket.on("disconnect", (r) => (reason = r));

      const res = await revoke(victim);
      assert.ok(res.status >= 200 && res.status < 300, `událost selhala se stavem ${res.status}`);

      await waitFor(() => reason !== null, "server odpojil socket oběti");
      assert.equal(reason, "io server disconnect");
      const reconnected = tokenStaysValid ? record(await connect(oldToken)) : [];
      await postMessageAndWait(world.memberA, control);
      assert.deepEqual([...received, ...reconnected], [], "oběť už nedostane události chaty");
      if (!tokenStaysValid) await assert.rejects(connect(oldToken), "starý token se nepřipojí");
      assert.equal(bystander.connected, true, "ostatní uživatelé zůstanou připojení");
    });
  }
});
