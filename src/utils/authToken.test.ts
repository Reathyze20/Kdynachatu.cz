import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

// config.ts ukončí proces bez JWT_SECRET – nastavit před dynamickým importem.
const TEST_SECRET = "test-secret-for-auth-token-unit-tests-0123456789";
process.env.JWT_SECRET ||= TEST_SECRET;

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;
const routesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../backend/routes");

let authToken: typeof import("./authToken");

before(async () => {
  authToken = await import("./authToken");
});

describe("JWT TTL", () => {
  test("shared TTL is 7 days", () => {
    assert.equal(authToken.JWT_TTL, "7d");
  });

  test("signAuthToken issues a token valid for exactly 7 days with the user claims", () => {
    const token = authToken.signAuthToken({
      id: "user-1",
      username: "jana",
      role: "admin",
      cabinId: "cabin-1",
      isSuperAdmin: false,
      tokenVersion: 3,
    });

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as jwt.JwtPayload;

    assert.equal(decoded.exp! - decoded.iat!, SEVEN_DAYS_IN_SECONDS);
    assert.equal(decoded.userId, "user-1");
    assert.equal(decoded.username, "jana");
    assert.equal(decoded.role, "admin");
    assert.equal(decoded.cabinId, "cabin-1");
    assert.equal(decoded.isSuperAdmin, false);
    assert.equal(decoded.tokenVersion, 3);
  });

  test("all 5 token-issuing routes use signAuthToken and no route hardcodes a TTL", () => {
    const expectedCallSites: Record<string, number> = {
      "auth.ts": 2, // POST /login, GET /refresh-token
      "cabin.ts": 1, // POST /create (založení chaty)
      "invites.ts": 1, // POST /accept/:token (přijetí pozvánky)
      "users.ts": 1, // PATCH /me/password (nový token aktuálního zařízení, #485)
    };

    for (const [file, count] of Object.entries(expectedCallSites)) {
      const source = readFileSync(path.join(routesDir, file), "utf8");
      const calls = source.match(/signAuthToken\(/g) ?? [];

      assert.equal(calls.length, count, `${file}: expected ${count} signAuthToken call(s)`);
      assert.doesNotMatch(source, /jwt\.sign\(/, `${file}: tokens must be issued via signAuthToken`);
      assert.doesNotMatch(source, /["']30d["']/, `${file}: leftover 30d TTL literal`);
    }
  });
});
