import "./env"; // musí zůstat první import
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Express } from "express";
import request from "supertest";
import { createApp } from "../../backend/app";
import { setupIntegrationFile, teardownIntegrationFile, type TestWorld } from "./harness";

// #499: limitery na auth cestách vrací JSON `{ message }` a `Retry-After`. Holý řetězec v těle
// frontend nenašel a ukázal „Chyba sítě“. Vlastní instance aplikace = vlastní paměť limiterů,
// každý test navíc posílá jinou „skutečnou“ IP (viz rateLimits.itest.ts).

let limitedApp: Express;
let world: TestWorld;

before(async () => {
  ({ world } = await setupIntegrationFile());
  limitedApp = createApp({ enableRateLimits: true }).app;
});

after(async () => {
  await teardownIntegrationFile();
});

function assertJsonLimitResponse(res: request.Response) {
  assert.equal(res.status, 429);
  assert.match(String(res.headers["content-type"]), /application\/json/);
  assert.equal(typeof res.body.message, "string");
  assert.ok(res.body.message.length > 0);
  assert.ok(Number(res.headers["retry-after"]) > 0, "Retry-After v sekundách");
}

describe("rate limit responses on auth paths are JSON { message } (#499)", () => {
  test("login limiter", async () => {
    const login = () =>
      request(limitedApp)
        .post("/api/login")
        .set("X-Forwarded-For", "203.0.113.60")
        .send({ username: world.memberA.username, password: "spatne-heslo" });
    for (let attempt = 1; attempt <= 10; attempt++) {
      assert.equal((await login()).status, 401, `attempt ${attempt}`);
    }
    assertJsonLimitResponse(await login());
  });

  test("auth limiter on register, forgot password and invite accept", async () => {
    const paths = ["/api/register", "/api/forgot-password", "/api/invites/accept"];
    const call = (attempt: number) =>
      request(limitedApp).post(paths[attempt % paths.length]).set("X-Forwarded-For", "203.0.113.61").send({});
    for (let attempt = 1; attempt <= 30; attempt++) {
      assert.notEqual((await call(attempt)).status, 429, `attempt ${attempt}`);
    }
    for (let attempt = 0; attempt < paths.length; attempt++) {
      assertJsonLimitResponse(await call(attempt));
    }
  });

  test("general API limiter", async () => {
    const apiRequest = () => request(limitedApp).get("/api/neexistuje").set("X-Forwarded-For", "203.0.113.62");
    for (let batch = 0; batch < 10; batch++) {
      await Promise.all(Array.from({ length: 50 }, () => apiRequest()));
    }
    assertJsonLimitResponse(await apiRequest());
  });
});
