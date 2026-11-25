import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Express } from "express";
import { io as connectClient, type Socket } from "socket.io-client";
import prisma from "../../utils/prisma";
import { hashPassword } from "../../utils/password";
import { signAuthToken } from "../../utils/authToken";
import { addGuests, as, setupIntegrationFile, teardownIntegrationFile, tokenFor, TEST_PASSWORD, type TestUser, type TestWorldWithGuests } from "./harness";

// Socket.IO handshake (#486): uživatel z DB, ne z tokenu; host mimo room chaty; zneplatnění relací
// odpojí živé spojení. Skutečný server na náhodném portu a skutečný socket.io-client, žádné mocky.

let app: Express;
let server: Server;
let world: TestWorldWithGuests;
let superadmin: TestUser;
let url: string;
const openSockets: Socket[] = [];

const MESSAGE_EVENT = "message:created";
const DISCONNECT_TIMEOUT_MS = 2000;

function openSocket(token: string): Socket {
  const socket = connectClient(url, { path: "/ws", auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
  openSockets.push(socket);
  return socket;
}

/** Připojí socket; odmítnutý handshake vyhodí chybu se zprávou serveru. */
function connect(token: string): Promise<Socket> {
  const socket = openSocket(token);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

async function assertRejected(token: string, label: string): Promise<void> {
  await assert.rejects(connect(token), `${label}: handshake má být odmítnutý`);
}

function waitFor(predicate: () => boolean, label: string, timeoutMs = DISCONNECT_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error(`Nedočkali jsme se: ${label}`));
      setTimeout(tick, 10);
    };
    tick();
  });
}

/** Zprávy, které socket dostal (text zprávy z události `message:created`). */
function recordMessages(socket: Socket): string[] {
  const received: string[] = [];
  socket.on(MESSAGE_EVENT, (data: { message?: string }) => received.push(String(data.message)));
  return received;
}

let messageCounter = 0;
/**
 * Pošle zprávu do chaty autora a počká, až ji dostane kontrolní socket ze stejné chaty – pak už
 * ji měly dostat všechny sockety v roomu. Krátká rezerva pokryje doručení ostatním socketům.
 */
async function postMessageAndWait(author: TestUser, control: string[]): Promise<string> {
  messageCounter += 1;
  const message = `zprava-${messageCounter}-${author.username}`;
  const res = await as(app, author).post("/api/channels/messages").send({ message });
  assert.equal(res.status, 201, `zpráva od ${author.username} se neodeslala`);
  await waitFor(() => control.includes(message), `kontrolní socket dostal ${message}`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return message;
}

let userCounter = 0;
async function createCabinMember(overrides: { isSuperAdmin?: boolean; role?: string } = {}): Promise<TestUser> {
  userCounter += 1;
  const username = `socket-${userCounter}`;
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(TEST_PASSWORD),
      color: "#5d9b62",
      email: `${username}@example.test`,
      isEmailVerified: true,
      isVerified: true,
      role: overrides.role ?? "user",
      cabinId: world.cabinA.id,
      isSuperAdmin: overrides.isSuperAdmin ?? false,
    },
  });
  return { id: user.id, username, role: user.role, cabinId: world.cabinA.id, tokenVersion: user.tokenVersion };
}

before(async () => {
  const setup = await setupIntegrationFile();
  app = setup.app;
  server = setup.server;
  world = await addGuests(setup.world);
  superadmin = await createCabinMember({ isSuperAdmin: true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  openSockets.forEach((socket) => socket.disconnect());
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await teardownIntegrationFile();
});

describe("socket handshake loads the user from the DB (#486)", () => {
  test("a member with a current token connects", async () => {
    const socket = await connect(tokenFor(world.memberA));
    assert.equal(socket.connected, true);
  });

  test("a banned user does not connect", async () => {
    const user = await createCabinMember();
    await prisma.user.update({ where: { id: user.id }, data: { isBanned: true } });
    await assertRejected(tokenFor(user), "zabanovaný");
  });

  test("a deleted user does not connect", async () => {
    const user = await createCabinMember();
    await prisma.user.delete({ where: { id: user.id } });
    await assertRejected(tokenFor(user), "smazaný");
  });

  test("a token with an old tokenVersion does not connect", async () => {
    const user = await createCabinMember();
    const oldToken = tokenFor(user);
    await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
    await assertRejected(oldToken, "stará verze tokenu");
  });

  test("a token claiming another cabin gets events of the cabin from the DB only", async () => {
    const controlA = recordMessages(await connect(tokenFor(world.adminA)));
    const controlB = recordMessages(await connect(tokenFor(world.adminB)));
    // Token člena A podepsaný s cabinId chaty B (jako by ho vydala stará verze přihlášení).
    const spoofed = signAuthToken({
      id: world.memberA.id,
      username: world.memberA.username,
      role: "admin",
      cabinId: world.cabinB.id,
      isSuperAdmin: false,
      tokenVersion: world.memberA.tokenVersion ?? 0,
    });
    const received = recordMessages(await connect(spoofed));

    const fromB = await postMessageAndWait(world.memberB, controlB);
    const fromA = await postMessageAndWait(world.adminA, controlA);

    assert.deepEqual(received, [fromA], "jen zprávy chaty A (podle DB), nic z chaty B");
  });

  test("a guest does not get cabin events, even with a token claiming a member role", async () => {
    const control = recordMessages(await connect(tokenFor(world.adminA)));
    const guest = recordMessages(await connect(tokenFor(world.guestA)));
    const guestClaimingMember = recordMessages(await connect(tokenFor({ ...world.guestA, role: "user" })));

    await postMessageAndWait(world.memberA, control);

    assert.deepEqual(guest, [], "host nedostane zprávu z chaty");
    assert.deepEqual(guestClaimingMember, [], "role se bere z DB, ne z tokenu");
  });
});

describe("revoking sessions disconnects live sockets (#486)", () => {
  /** Oběť má živý socket; po události musí server spojení ukončit a starý token se už nepřipojí. */
  async function assertEventDisconnects(revoke: (victim: TestUser) => Promise<{ status: number }>) {
    const victim = await createCabinMember();
    const oldToken = tokenFor(victim);
    const control = recordMessages(await connect(tokenFor(world.adminA)));
    const victimSocket = await connect(oldToken);
    const received = recordMessages(victimSocket);
    let disconnectReason: string | null = null;
    victimSocket.on("disconnect", (reason) => {
      disconnectReason = reason;
    });

    const res = await revoke(victim);
    assert.ok(res.status >= 200 && res.status < 300, `událost selhala se stavem ${res.status}`);

    await waitFor(() => disconnectReason !== null, "server odpojil socket oběti");
    assert.equal(disconnectReason, "io server disconnect");
    await postMessageAndWait(world.memberA, control);
    assert.deepEqual(received, [], "po odpojení oběť nedostane události chaty");
    await assertRejected(oldToken, "starý token po události");
  }

  test("ban by the superadmin", async () => {
    await assertEventDisconnects((victim) => as(app, superadmin).patch(`/api/superadmin/users/${victim.id}/ban`));
  });

  test("removal from the cabin", async () => {
    await assertEventDisconnects((victim) =>
      as(app, world.adminA).patch(`/api/users/${victim.id}/remove-from-cabin`).send({ deleteData: false }),
    );
  });

  test("own password change", async () => {
    await assertEventDisconnects((victim) =>
      as(app, victim).patch("/api/users/me/password").send({ oldPassword: TEST_PASSWORD, newPassword: "nove-heslo-486-abc" }),
    );
  });

  test("revoking one user leaves other users connected", async () => {
    const bystander = await connect(tokenFor(world.memberA));
    await assertEventDisconnects((victim) => as(app, victim).post("/api/users/me/logout-all").send({}));
    assert.equal(bystander.connected, true);
  });
});
