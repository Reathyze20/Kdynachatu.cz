import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import request from "supertest";
import logger from "../../utils/logger";
import { createApp } from "../../backend/app";
import { CLIENT_LOG_CONTEXT_LIMITS } from "../../backend/routes/clientLogContext";
import { as, setupIntegrationFile, teardownIntegrationFile, type TestWorld } from "./harness";

// Rate limity (#479): na rozdíl od harnessu běží aplikace s `enableRateLimits: true`.
// Produkce stojí za nginx (`X-Forwarded-For $proxy_add_x_forwarded_for`) a app má `trust proxy 1`:
// nginx k hlavičce od klienta připojí skutečnou IP klienta jako poslední položku. Test to simuluje
// hlavičkou `<podvržená IP>, <skutečná IP>` – podvržená část se mezi pokusy mění, skutečná ne.
// Každý test používá vlastní „skutečnou“ IP, aby se limitery jednotlivých testů neovlivňovaly.

let app: Express;
let limitedApp: Express;
let world: TestWorld;

const frontendLogs: { msg: string; fields: Record<string, unknown> }[] = [];
const originalFrontend = logger.frontend;

before(async () => {
  ({ app, world } = await setupIntegrationFile());
  limitedApp = createApp({ enableRateLimits: true }).app;
  logger.frontend = (msg, fields) => {
    frontendLogs.push({ msg, fields: fields as Record<string, unknown> });
  };
});

after(async () => {
  logger.frontend = originalFrontend;
  await teardownIntegrationFile();
});

let spoofCounter = 0;
/** Hlavička, jakou by aplikaci předal nginx: podvržená IP od klienta (pokaždé jiná) + skutečná IP. */
const forwardedFor = (realIp: string) => `198.51.100.${(spoofCounter++ % 250) + 1}, ${realIp}`;

const failedLogin = (username: string, headers: Record<string, string> = {}) =>
  request(limitedApp).post("/api/login").set(headers).send({ username, password: "spatne-heslo" });

describe("rate limits: login (IP + username)", () => {
  test("the 11th failed login of the same username from the same IP returns 429, another username still gets 401", async () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      assert.equal((await failedLogin(world.memberA.username)).status, 401, `attempt ${attempt}`);
    }
    assert.equal((await failedLogin(world.memberA.username)).status, 429);
    assert.equal((await failedLogin(world.memberB.username)).status, 401);
  });

  test("changing X-Forwarded-For between attempts does not reset the limit", async () => {
    const realIp = "203.0.113.10";
    for (let attempt = 1; attempt <= 10; attempt++) {
      const res = await failedLogin(world.adminA.username, { "X-Forwarded-For": forwardedFor(realIp) });
      assert.equal(res.status, 401, `attempt ${attempt}`);
    }
    const blocked = await failedLogin(world.adminA.username, { "X-Forwarded-For": forwardedFor(realIp) });
    assert.equal(blocked.status, 429);
    // Kontrola: stejné jméno z jiné skutečné IP limit nemá.
    const otherClient = await failedLogin(world.adminA.username, { "X-Forwarded-For": forwardedFor("203.0.113.11") });
    assert.equal(otherClient.status, 401);
  });
});

describe("rate limits: auth limiter (30 requests per IP)", () => {
  test("the 31st request to a public auth endpoint returns 429 despite a changing X-Forwarded-For", async () => {
    const realIp = "203.0.113.20";
    const forgotPassword = () =>
      request(limitedApp).post("/api/forgot-password").set("X-Forwarded-For", forwardedFor(realIp)).send({});
    for (let attempt = 1; attempt <= 30; attempt++) {
      assert.notEqual((await forgotPassword()).status, 429, `attempt ${attempt}`);
    }
    assert.equal((await forgotPassword()).status, 429);
  });
});

describe("rate limits: API limiter (500 requests per IP)", () => {
  test("the 501st API request returns 429 despite a changing X-Forwarded-For", async () => {
    const realIp = "203.0.113.30";
    const apiRequest = () => request(limitedApp).get("/api/neexistuje").set("X-Forwarded-For", forwardedFor(realIp));
    for (let batch = 0; batch < 10; batch++) {
      const statuses = await Promise.all(Array.from({ length: 50 }, () => apiRequest().then((res) => res.status)));
      assert.deepEqual([...new Set(statuses)], [404], `batch ${batch}`);
    }
    assert.equal((await apiRequest()).status, 429);
  });
});

describe("rate limits: anonymous client logs (10 per minute per IP)", () => {
  const anonLog = (realIp: string) =>
    request(limitedApp)
      .post("/api/logs/client/anon")
      .set("X-Forwarded-For", forwardedFor(realIp))
      .send({ message: "Chyba na přihlašovací stránce" });

  test("the 11th report returns 429 despite a changing X-Forwarded-For, another client is unaffected", async () => {
    const realIp = "203.0.113.40";
    for (let attempt = 1; attempt <= 10; attempt++) {
      assert.equal((await anonLog(realIp)).status, 204, `attempt ${attempt}`);
    }
    assert.equal((await anonLog(realIp)).status, 429);
    assert.equal((await anonLog("203.0.113.41")).status, 204);
  });

  test("the logged IP is the real client IP, not the spoofed one", async () => {
    frontendLogs.length = 0;
    assert.equal((await anonLog("203.0.113.42")).status, 204);
    assert.equal(frontendLogs[0]?.fields.ip, "203.0.113.42");
  });
});

describe("client logs: context size is bounded", () => {
  /** Rezerva na obálku `{ truncated, preview }` a escapování náhledu nad `maxTotalLength`. */
  const maxLoggedLength = CLIENT_LOG_CONTEXT_LIMITS.maxTotalLength + 100;
  const oversizedContext = {
    huge: "x".repeat(100_000),
    deep: { a: { b: { c: { d: { e: { f: "hluboko" } } } } } },
    ...Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`key${i}`, `hodnota ${i}`])),
  };

  test("an oversized context is logged cut down, not in full size", async () => {
    frontendLogs.length = 0;
    const res = await as(app, world.memberA)
      .post("/api/logs/client")
      .send({ message: "Chyba s velkým kontextem", context: oversizedContext });
    assert.equal(res.status, 204);
    assert.equal(frontendLogs.length, 1);
    const logged = JSON.stringify(frontendLogs[0].fields.context);
    assert.ok(logged.length <= maxLoggedLength, `logged context has ${logged.length} chars`);
    assert.ok(!logged.includes("x".repeat(CLIENT_LOG_CONTEXT_LIMITS.maxStringLength + 1)));
    assert.ok(!logged.includes("key199"));
    assert.ok(!logged.includes("hluboko"), "objects nested too deep are cut off");
  });

  test("the anonymous endpoint bounds the context as well", async () => {
    frontendLogs.length = 0;
    const res = await request(app)
      .post("/api/logs/client/anon")
      .set("X-Forwarded-For", forwardedFor("203.0.113.50"))
      .send({ message: "Anonymní chyba s velkým kontextem", context: oversizedContext });
    assert.equal(res.status, 204);
    const logged = JSON.stringify(frontendLogs[0]?.fields.context);
    assert.ok(logged.length <= maxLoggedLength, `logged context has ${logged.length} chars`);
  });
});
