import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// Registrace chat vypnutá. Env se nastaví před dynamickým importem (dotenv existující klíče nepřepíše).
// DATABASE_URL míří na nedostupný port: 403 bez chyby 500 tak dokazuje, že handler na DB vůbec nesáhl.
process.env.CABIN_SIGNUP_ENABLED = "false";
process.env.JWT_SECRET = "test-secret-for-cabin-signup-tests-0123456789";
process.env.DATABASE_URL = "postgresql://nobody:nobody@127.0.0.1:1/no_database";

const CLOSED_MESSAGE = "Registrace nových chat je zatím uzavřená.";

let server: Server;
let baseUrl: string;

before(async () => {
  const express = (await import("express")).default;
  const authRoutes = (await import("./auth")).default;
  const cabinRoutes = (await import("./cabin")).default;
  const invitesRoutes = (await import("./invites")).default;

  // Stejné cesty jako v server.new.ts.
  const app = express();
  app.use(express.json());
  app.use("/api", authRoutes);
  app.use("/api/cabin", cabinRoutes);
  app.use("/api/invites", invitesRoutes);

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const prisma = (await import("../../utils/prisma")).default;
  await prisma.$disconnect();
});

const post = (path: string, body: object) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer whatever" },
    body: JSON.stringify(body),
  });
const signup = { cabinName: "Chata Test", weatherLocation: "Praha", username: "novak", email: "novak@example.com", password: "Heslo-123456" };

describe("cabin signup closed (CABIN_SIGNUP_ENABLED=false)", () => {
  test("GET /api/signup-status reports signup as closed", async () => {
    const res = await fetch(`${baseUrl}/api/signup-status`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { cabinSignupEnabled: false });
  });

  for (const [path, body] of [["/api/register", signup], ["/api/cabin/create", { name: "Chata Test" }]] as const) {
    test(`POST ${path} returns 403 without touching the database`, async () => {
      const res = await post(path, body);
      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { message: CLOSED_MESSAGE });
    });
  }

  // Bez DB harnessu (#120) jen ověření, že brána je nepustí na 403 – dojdou až k DB a skončí 500.
  for (const path of ["/api/login", "/api/invites/accept/some-token"]) {
    test(`POST ${path} is not gated by the signup flag`, async () => {
      const res = await post(path, { username: "novak", password: "Heslo-123456" });
      assert.notEqual(res.status, 403);
      assert.notEqual(((await res.json()) as { message?: string }).message, CLOSED_MESSAGE);
    });
  }
});

describe("requireCabinSignupOpen", () => {
  test("lets the request through when signup is open", async () => {
    const { requireCabinSignupOpen } = await import("./cabinSignup");
    let nextCalled = false;
    let statusCalled = false;
    const res = { status: () => { statusCalled = true; return res; }, json: () => res };
    requireCabinSignupOpen(true)({} as never, res as never, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(statusCalled, false);
  });
});
